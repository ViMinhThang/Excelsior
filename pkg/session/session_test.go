package session

import (
	"errors"
	"fmt"
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
	if err := s.Save(Record{ID: "sess-title-1", Title: "Project Blueprint", Messages: msgs}); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	rec, err := s.Load("sess-title-1")
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if rec.Title != "Project Blueprint" {
		t.Errorf("expected Title 'Project Blueprint', got %q", rec.Title)
	}
	if len(rec.Messages) != 2 {
		t.Errorf("expected 2 messages, got %d", len(rec.Messages))
	}

	// Rename session
	recRename, err := s.Load("sess-title-1")
	if err != nil {
		t.Fatalf("Load for rename failed: %v", err)
	}
	recRename.Title = "Updated Project Blueprint"
	if err := s.Save(recRename); err != nil {
		t.Fatalf("Rename failed: %v", err)
	}

	recAfterRename, err := s.Load("sess-title-1")
	if err != nil {
		t.Fatalf("Load after rename failed: %v", err)
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
	if err := s.Save(recAfterRename); err != nil {
		t.Fatalf("Save next turn failed: %v", err)
	}

	recAfterAppend, err := s.Load("sess-title-1")
	if err != nil {
		t.Fatalf("Load after append failed: %v", err)
	}
	if recAfterAppend.Title != "Updated Project Blueprint" {
		t.Errorf("expected Title to be preserved, got %q", recAfterAppend.Title)
	}
	if len(recAfterAppend.Messages) != 3 {
		t.Errorf("expected 3 messages, got %d", len(recAfterAppend.Messages))
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

func TestSessionSentinels_WrapWithFmt(t *testing.T) {
	sentinels := []error{
		ErrSessionNotFound, ErrInvalidSessionID, ErrEmptySessionID,
		ErrCorruptedSession, ErrEmptySession, ErrStoreDirEmpty,
	}
	for _, s := range sentinels {
		if err := fmt.Errorf("session test: %w", s); !errors.Is(err, s) {
			t.Errorf("expected Is(%v)", s)
		}
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
