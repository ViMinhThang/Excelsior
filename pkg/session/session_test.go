package session

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"excelsior/pkg/llm"
)

func TestStore_SaveLoad(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(filepath.Join(dir, "sess"))
	msgs := []llm.Message{{Role: "user", Content: "hi"}}
	if err := s.Save(context.Background(), "test-1", msgs); err != nil {
		t.Fatalf("save: %v", err)
	}
	got, err := s.Load(context.Background(), "test-1")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(got) != 1 || got[0].Content != "hi" {
		t.Fatalf("unexpected load %v", got)
	}
}

func TestStore_TitlePersistenceAndRename(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(filepath.Join(dir, "sess"))

	// Save initial session with custom title
	msgs := []llm.Message{
		{Role: "user", Content: "Plan the project"},
		{Role: "assistant", Content: "Here is the plan."},
	}
	if err := s.SaveWithTitle(context.Background(), "sess-title-1", "Project Blueprint", msgs); err != nil {
		t.Fatalf("SaveWithTitle failed: %v", err)
	}

	rec, err := s.LoadRecord(context.Background(), "sess-title-1")
	if err != nil {
		t.Fatalf("LoadRecord failed: %v", err)
	}
	if rec.Title != "Project Blueprint" {
		t.Errorf("expected Title 'Project Blueprint', got %q", rec.Title)
	}
	if len(rec.Messages) != 2 {
		t.Errorf("expected 2 messages, got %d", len(rec.Messages))
	}

	// Rename session
	if err := s.Rename(context.Background(), "sess-title-1", "Updated Project Blueprint"); err != nil {
		t.Fatalf("Rename failed: %v", err)
	}

	recAfterRename, err := s.LoadRecord(context.Background(), "sess-title-1")
	if err != nil {
		t.Fatalf("LoadRecord after rename failed: %v", err)
	}
	if recAfterRename.Title != "Updated Project Blueprint" {
		t.Errorf("expected Title 'Updated Project Blueprint', got %q", recAfterRename.Title)
	}
	if len(recAfterRename.Messages) != 2 {
		t.Errorf("expected 2 messages preserved after rename, got %d", len(recAfterRename.Messages))
	}

	// Append next turn with Save() — title should be preserved!
	nextMsgs := append(msgs, llm.Message{Role: "user", Content: "Looks good!"})
	if err := s.Save(context.Background(), "sess-title-1", nextMsgs); err != nil {
		t.Fatalf("Save next turn failed: %v", err)
	}

	recAfterAppend, err := s.LoadRecord(context.Background(), "sess-title-1")
	if err != nil {
		t.Fatalf("LoadRecord after append failed: %v", err)
	}
	if recAfterAppend.Title != "Updated Project Blueprint" {
		t.Errorf("expected Title to be preserved, got %q", recAfterAppend.Title)
	}
	if len(recAfterAppend.Messages) != 3 {
		t.Errorf("expected 3 messages, got %d", len(recAfterAppend.Messages))
	}
}

func TestStore_BackwardCompatibilityWithoutTitle(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)

	// Simulate old .jsonl file without "title" key
	oldJSONL := `{"id":"legacy-1","createdAt":"2026-08-01T00:00:00Z","messages":[{"role":"user","content":"legacy message"}]}` + "\n"
	p := filepath.Join(dir, "legacy-1.jsonl")
	if err := os.WriteFile(p, []byte(oldJSONL), 0o600); err != nil {
		t.Fatalf("write legacy jsonl: %v", err)
	}

	rec, err := s.LoadRecord(context.Background(), "legacy-1")
	if err != nil {
		t.Fatalf("load legacy record: %v", err)
	}
	if rec.Title != "" {
		t.Errorf("expected empty title for legacy record, got %q", rec.Title)
	}
	if len(rec.Messages) != 1 || rec.Messages[0].Content != "legacy message" {
		t.Errorf("unexpected legacy messages: %+v", rec.Messages)
	}
}

func TestStore_SanitizeID(t *testing.T) {
	s := NewStore(t.TempDir())
	if err := s.Save(context.Background(), "../escape", nil); err == nil {
		t.Fatal("expected invalid id error")
	}
	if err := s.Save(context.Background(), "bad/id", nil); err == nil {
		t.Fatal("expected slash error")
	}
	if err := s.Save(context.Background(), "", nil); err == nil {
		t.Fatal("expected empty id error")
	}
}

func TestStore_CorruptionHandling(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	if err := s.Save(context.Background(), "valid-1", []llm.Message{{Role: "user", Content: "a"}}); err != nil {
		t.Fatal(err)
	}

	// Append corrupt line at the end
	p := filepath.Join(dir, "valid-1.jsonl")
	f, err := os.OpenFile(p, os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = f.WriteString("{corrupted json line\n")
	_ = f.Close()

	// Load should still succeed via last valid line
	msgs, err := s.Load(context.Background(), "valid-1")
	if err != nil {
		t.Fatalf("load after corrupt append: %v", err)
	}
	if len(msgs) != 1 || msgs[0].Content != "a" {
		t.Fatalf("expected 1 valid message, got %v", msgs)
	}
}

func TestStore_ListAndDelete(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	_ = s.Save(context.Background(), "a-1", []llm.Message{{Role: "user", Content: "x"}})
	_ = s.Save(context.Background(), "b-1", []llm.Message{{Role: "user", Content: "y"}})

	list, err := s.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2, got %v", list)
	}

	if err := s.Delete(context.Background(), "a-1"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	listAfter, err := s.List(context.Background())
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	if len(listAfter) != 1 || listAfter[0] != "b-1" {
		t.Fatalf("expected only b-1, got %v", listAfter)
	}
}

func TestStore_Prune(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	_ = s.Save(context.Background(), "old-sess", []llm.Message{{Role: "user", Content: "old"}})
	_ = s.Save(context.Background(), "new-sess", []llm.Message{{Role: "user", Content: "new"}})

	oldFile := filepath.Join(dir, "old-sess.jsonl")
	oldTime := time.Now().Add(-48 * time.Hour)
	_ = os.Chtimes(oldFile, oldTime, oldTime)

	deleted, err := s.Prune(context.Background(), 24*time.Hour)
	if err != nil {
		t.Fatalf("prune: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("expected 1 deleted, got %d", deleted)
	}

	list, err := s.List(context.Background())
	if err != nil {
		t.Fatalf("list after prune: %v", err)
	}
	if len(list) != 1 || list[0] != "new-sess" {
		t.Fatalf("expected [new-sess], got %v", list)
	}
}
