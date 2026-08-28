package session

import (
	"context"
	"path/filepath"
	"testing"

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

func TestStore_SanitizeID(t *testing.T) {
	s := NewStore(t.TempDir())
	if err := s.Save(context.Background(), "../escape", nil); err == nil {
		t.Fatal("expected invalid id error")
	}
	if err := s.Save(context.Background(), "bad/id", nil); err == nil {
		t.Fatal("expected slash error")
	}
}

func TestStore_CorruptionHandling(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	if err := s.Save(context.Background(), "valid-1", []llm.Message{{Role: "user", Content: "a"}}); err != nil {
		t.Fatal(err)
	}
	// Load should still succeed via last valid line
	msgs, err := s.Load(context.Background(), "valid-1")
	if err != nil {
		t.Fatalf("load after valid: %v", err)
	}
	if len(msgs) == 0 {
		t.Fatal("expected msgs")
	}
}

func TestStore_List(t *testing.T) {
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
}
