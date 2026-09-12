package chat

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"excelsior/pkg/llm"
	"excelsior/pkg/session"
)

func TestCorruptSessionFailsBeforeRunner(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "broken.jsonl")
	if err := os.WriteFile(path, []byte("corrupt"), 0600); err != nil {
		t.Fatal(err)
	}
	coord := NewCoordinator(Config{StoreFactory: func(string) session.Store { return session.NewDirStore(dir) }})
	// A nil runner factory would panic in ExecuteTurn if corrupt history were silently treated as empty.
	_, err := coord.ReserveTurn(dir, "broken", llm.Message{Role: "user", Content: "hello"})
	if !errors.Is(err, session.ErrCorruptedSession) {
		t.Fatalf("got %v", err)
	}
	b, err := os.ReadFile(path)
	if err != nil || string(b) != "corrupt" {
		t.Fatal("history changed")
	}
}
