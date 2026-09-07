package chat

import (
	"context"
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
	// A nil runner would panic if corrupt history were silently treated as empty.
	_, err := (Service{Store: session.NewDirStore(dir)}).Run(context.Background(), Request{SessionID: "broken", Messages: []llm.Message{{Role: "user", Content: "hello"}}})
	if !errors.Is(err, session.ErrCorruptedSession) {
		t.Fatalf("got %v", err)
	}
	b, err := os.ReadFile(path)
	if err != nil || string(b) != "corrupt" {
		t.Fatal("history changed")
	}
}
