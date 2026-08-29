package session

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"excelsior/pkg/llm"
)

func TestDirStore_SaveLoad(t *testing.T) {
	dir := t.TempDir()
	s := NewDirStore(filepath.Join(dir, "sess"))
	msgs := []llm.Message{{Role: "user", Content: "hi"}}
	rec := Record{ID: "test-1", Title: "Greeting", Messages: msgs}
	if err := s.Save(rec); err != nil {
		t.Fatalf("save: %v", err)
	}
	got, err := s.Load("test-1")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if got.ID != "test-1" || got.Title != "Greeting" || len(got.Messages) != 1 || got.Messages[0].Content != "hi" {
		t.Fatalf("unexpected load %+v", got)
	}
}

func TestDirStore_TitlePersistenceAndRename(t *testing.T) {
	dir := t.TempDir()
	s := NewDirStore(filepath.Join(dir, "sess"))

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

	// Append next turn with Save() — title preserved in record
	nextMsgs := append(msgs, llm.Message{Role: "user", Content: "Looks good!"})
	recAfterRename.Messages = nextMsgs
	if err := s.Save(*recAfterRename); err != nil {
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

func TestDirStore_BackwardCompatibilityWithoutTitle(t *testing.T) {
	dir := t.TempDir()
	s := NewDirStore(dir)

	// Simulate old .jsonl file without "title" or "updatedAt"
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
	if rec.UpdatedAt.IsZero() {
		t.Error("expected non-zero UpdatedAt mapped from CreatedAt")
	}
}

func TestDirStore_SanitizeID(t *testing.T) {
	s := NewDirStore(t.TempDir())
	if err := s.Save(Record{ID: "../escape"}); err == nil {
		t.Fatal("expected invalid id error")
	} else if !errors.Is(err, ErrInvalidSessionID) {
		t.Errorf("expected ErrInvalidSessionID, got %v", err)
	}
	if err := s.Save(Record{ID: "bad/id"}); err == nil {
		t.Fatal("expected slash error")
	} else if !errors.Is(err, ErrInvalidSessionID) {
		t.Errorf("expected ErrInvalidSessionID, got %v", err)
	}
	if err := s.Save(Record{ID: ""}); err == nil {
		t.Fatal("expected empty id error")
	} else if !errors.Is(err, ErrEmptySessionID) && !errors.Is(err, ErrInvalidSessionID) {
		t.Errorf("expected ErrEmptySessionID, got %v", err)
	}
}

func TestDirStore_CorruptionHandling(t *testing.T) {
	dir := t.TempDir()
	s := NewDirStore(dir)
	if err := s.Save(Record{ID: "valid-1", Messages: []llm.Message{{Role: "user", Content: "a"}}}); err != nil {
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
	rec, err := s.Load("valid-1")
	if err != nil {
		t.Fatalf("load after corrupt append: %v", err)
	}
	if len(rec.Messages) != 1 || rec.Messages[0].Content != "a" {
		t.Fatalf("expected 1 valid message, got %v", rec.Messages)
	}
}

func TestDirStore_NotFoundAndCorruptionErrors(t *testing.T) {
	dir := t.TempDir()
	s := NewDirStore(dir)

	// Non-existent session
	_, err := s.Load("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent session")
	}
	if !errors.Is(err, ErrSessionNotFound) {
		t.Errorf("expected ErrSessionNotFound, got %v", err)
	}

	// Empty session file
	emptyPath := filepath.Join(dir, "empty-session.jsonl")
	if err := os.WriteFile(emptyPath, []byte("   \n\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = s.Load("empty-session")
	if err == nil {
		t.Fatal("expected error for empty session file")
	}
	if !errors.Is(err, ErrEmptySession) {
		t.Errorf("expected ErrEmptySession, got %v", err)
	}

	// All corrupt session file
	corruptPath := filepath.Join(dir, "all-corrupt.jsonl")
	if err := os.WriteFile(corruptPath, []byte("bad line 1\nbad line 2\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = s.Load("all-corrupt")
	if err == nil {
		t.Fatal("expected error for all-corrupt session file")
	}
	if !errors.Is(err, ErrCorruptedSession) {
		t.Errorf("expected ErrCorruptedSession, got %v", err)
	}
}

func TestDirStore_ListAndDelete(t *testing.T) {
	dir := t.TempDir()
	s := NewDirStore(dir)
	_ = s.Save(Record{ID: "a-1", Title: "Chat A", Messages: []llm.Message{{Role: "user", Content: "x"}}})
	time.Sleep(10 * time.Millisecond)
	_ = s.Save(Record{ID: "b-1", Title: "Chat B", Messages: []llm.Message{{Role: "user", Content: "y"}}})

	list, err := s.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2, got %d", len(list))
	}
	// Ordered by UpdatedAt descending -> b-1 first
	if list[0].ID != "b-1" || list[0].Title != "Chat B" {
		t.Errorf("expected b-1 first, got %+v", list[0])
	}

	// Latest check
	latest, err := s.Latest()
	if err != nil {
		t.Fatalf("latest: %v", err)
	}
	if latest.ID != "b-1" {
		t.Errorf("expected latest ID b-1, got %s", latest.ID)
	}

	if err := s.Delete("a-1"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	listAfter, err := s.List()
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	if len(listAfter) != 1 || listAfter[0].ID != "b-1" {
		t.Fatalf("expected only b-1, got %+v", listAfter)
	}
}

func TestDirStore_Prune(t *testing.T) {
	dir := t.TempDir()
	s := NewDirStore(dir)
	_ = s.Save(Record{ID: "old-sess", Messages: []llm.Message{{Role: "user", Content: "old"}}})
	_ = s.Save(Record{ID: "new-sess", Messages: []llm.Message{{Role: "user", Content: "new"}}})

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

	list, err := s.List()
	if err != nil {
		t.Fatalf("list after prune: %v", err)
	}
	if len(list) != 1 || list[0].ID != "new-sess" {
		t.Fatalf("expected [new-sess], got %+v", list)
	}
}

func TestDirStore_ConcurrentAccess(t *testing.T) {
	dir := t.TempDir()
	s := NewDirStore(dir)

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(3)
		id := "concurrent-sess"
		go func(idx int) {
			defer wg.Done()
			_ = s.Save(Record{
				ID:       id,
				Title:    "Concurrent Title",
				Messages: []llm.Message{{Role: "user", Content: "hello"}},
			})
		}(i)
		go func() {
			defer wg.Done()
			_, _ = s.Load(id)
		}()
		go func() {
			defer wg.Done()
			_, _ = s.List()
		}()
	}
	wg.Wait()

	rec, err := s.Load("concurrent-sess")
	if err != nil {
		t.Fatalf("load after concurrent access failed: %v", err)
	}
	if rec.ID != "concurrent-sess" {
		t.Fatalf("corrupted id: %s", rec.ID)
	}
}

func TestSessionError_FormattingAndUnwrap(t *testing.T) {
	se1 := &SessionError{
		Op:        "load",
		SessionID: "sess-1",
		Path:      "/tmp/sess-1.jsonl",
		Msg:       "read failed",
		Err:       ErrSessionNotFound,
	}
	if !errors.Is(se1, ErrSessionNotFound) {
		t.Errorf("expected Is(ErrSessionNotFound)")
	}
	if se1.Unwrap() != ErrSessionNotFound {
		t.Errorf("expected Unwrap() to return ErrSessionNotFound")
	}
	if se1.Error() == "" {
		t.Errorf("expected non-empty Error string")
	}

	sentinels := []error{
		ErrSessionNotFound, ErrInvalidSessionID, ErrEmptySessionID,
		ErrCorruptedSession, ErrEmptySession, ErrStoreDirEmpty,
	}
	for _, s := range sentinels {
		se := &SessionError{Err: s}
		if !errors.Is(se, s) {
			t.Errorf("expected Is(%v) on SessionError", s)
		}
	}

	seEmpty := &SessionError{}
	if seEmpty.Error() != "session" {
		t.Errorf("expected 'session', got %q", seEmpty.Error())
	}
	if seEmpty.Is(nil) {
		t.Error("Is(nil) should be false")
	}
}

func TestDirStore_EmptyDir(t *testing.T) {
	s := NewDirStore("")
	if err := s.Save(Record{ID: "test"}); err == nil || !errors.Is(err, ErrStoreDirEmpty) {
		t.Fatalf("expected ErrStoreDirEmpty on empty store dir, got %v", err)
	}
	if _, err := s.Load("test"); err == nil || !errors.Is(err, ErrStoreDirEmpty) {
		t.Fatalf("expected ErrStoreDirEmpty on empty store dir Load, got %v", err)
	}
	if _, err := s.List(); err == nil || !errors.Is(err, ErrStoreDirEmpty) {
		t.Fatalf("expected ErrStoreDirEmpty on empty store dir List, got %v", err)
	}
	if err := s.Delete("test"); err == nil || !errors.Is(err, ErrStoreDirEmpty) {
		t.Fatalf("expected ErrStoreDirEmpty on empty store dir Delete, got %v", err)
	}
}

