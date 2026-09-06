package session

import (
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"excelsior/pkg/llm"
)

func TestMemoryStore_SaveLoad(t *testing.T) {
	m := NewMemoryStore()
	msgs := []llm.Message{{Role: "user", Content: "hello memory"}}
	rec := Record{
		ID:       "mem-1",
		Title:    "Memory Session",
		Messages: msgs,
	}

	if err := m.Save(rec); err != nil {
		t.Fatalf("save failed: %v", err)
	}

	// Mutate original slice to ensure deep copy protection
	msgs[0].Content = "mutated content"

	got, err := m.Load("mem-1")
	if err != nil {
		t.Fatalf("load failed: %v", err)
	}
	if got.ID != "mem-1" {
		t.Errorf("expected ID mem-1, got %q", got.ID)
	}
	if got.Title != "Memory Session" {
		t.Errorf("expected Title 'Memory Session', got %q", got.Title)
	}
	if len(got.Messages) != 1 || got.Messages[0].Content != "hello memory" {
		t.Errorf("deep copy failure: expected 'hello memory', got %q", got.Messages[0].Content)
	}
	if got.CreatedAt.IsZero() || got.UpdatedAt.IsZero() {
		t.Error("expected timestamps to be populated")
	}

	// Mutate returned message slice to ensure read deep copy protection
	got.Messages[0].Content = "mutated read content"
	got2, _ := m.Load("mem-1")
	if got2.Messages[0].Content != "hello memory" {
		t.Errorf("read deep copy failure: expected 'hello memory', got %q", got2.Messages[0].Content)
	}
}

func TestMemoryStore_ListOrdering(t *testing.T) {
	m := NewMemoryStore()
	_ = m.Save(Record{ID: "sess-1", Title: "Oldest", Messages: []llm.Message{{Role: "user", Content: "1"}}})
	time.Sleep(10 * time.Millisecond)
	_ = m.Save(Record{ID: "sess-2", Title: "Middle", Messages: []llm.Message{{Role: "user", Content: "2"}, {Role: "assistant", Content: "3"}}})
	time.Sleep(10 * time.Millisecond)
	_ = m.Save(Record{ID: "sess-3", Title: "Newest", Messages: []llm.Message{{Role: "user", Content: "4"}}})

	list, err := m.List()
	if err != nil {
		t.Fatalf("list failed: %v", err)
	}
	if len(list) != 3 {
		t.Fatalf("expected 3 sessions, got %d", len(list))
	}
	if list[0].ID != "sess-3" || list[0].Title != "Newest" || list[0].MsgCount != 1 {
		t.Errorf("expected sess-3 newest first, got %+v", list[0])
	}
	if list[1].ID != "sess-2" || list[1].Title != "Middle" || list[1].MsgCount != 2 {
		t.Errorf("expected sess-2 second, got %+v", list[1])
	}
	if list[2].ID != "sess-1" || list[2].Title != "Oldest" || list[2].MsgCount != 1 {
		t.Errorf("expected sess-1 third, got %+v", list[2])
	}
}

func TestMemoryStore_Latest(t *testing.T) {
	m := NewMemoryStore()

	// Empty store should return ErrSessionNotFound
	_, err := m.Latest()
	if err == nil || !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("expected ErrSessionNotFound for empty store, got %v", err)
	}

	_ = m.Save(Record{ID: "sess-first", Title: "First"})
	time.Sleep(10 * time.Millisecond)
	_ = m.Save(Record{ID: "sess-second", Title: "Second"})

	latest, err := m.Latest()
	if err != nil {
		t.Fatalf("latest failed: %v", err)
	}
	if latest.ID != "sess-second" {
		t.Errorf("expected latest ID 'sess-second', got %q", latest.ID)
	}

	// Update first session -> should now become latest
	time.Sleep(10 * time.Millisecond)
	_ = m.Save(Record{ID: "sess-first", Title: "First Updated"})
	latestUpdated, err := m.Latest()
	if err != nil {
		t.Fatalf("latest after update failed: %v", err)
	}
	if latestUpdated.ID != "sess-first" {
		t.Errorf("expected latest ID 'sess-first', got %q", latestUpdated.ID)
	}
}

func TestMemoryStore_Delete(t *testing.T) {
	m := NewMemoryStore()
	_ = m.Save(Record{ID: "to-delete", Title: "Delete Me"})

	// Delete existing
	if err := m.Delete("to-delete"); err != nil {
		t.Fatalf("delete existing failed: %v", err)
	}

	// Verify it's gone
	_, err := m.Load("to-delete")
	if err == nil || !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("expected ErrSessionNotFound after delete, got %v", err)
	}

	// Delete non-existing (idempotent)
	if err := m.Delete("to-delete"); err != nil {
		t.Fatalf("delete non-existing failed: %v", err)
	}
}

func TestMemoryStore_SanitizeID(t *testing.T) {
	m := NewMemoryStore()

	if err := m.Save(Record{ID: "../bad"}); err == nil || !errors.Is(err, ErrInvalidSessionID) {
		t.Fatalf("expected ErrInvalidSessionID for path traversal, got %v", err)
	}
	if err := m.Save(Record{ID: "bad/slash"}); err == nil || !errors.Is(err, ErrInvalidSessionID) {
		t.Fatalf("expected ErrInvalidSessionID for slash, got %v", err)
	}
	if err := m.Save(Record{ID: ""}); err == nil || (!errors.Is(err, ErrEmptySessionID) && !errors.Is(err, ErrInvalidSessionID)) {
		t.Fatalf("expected ErrEmptySessionID for empty ID, got %v", err)
	}

	if _, err := m.Load("../bad"); err == nil || !errors.Is(err, ErrInvalidSessionID) {
		t.Fatalf("expected ErrInvalidSessionID on Load, got %v", err)
	}
	if err := m.Delete("../bad"); err == nil || !errors.Is(err, ErrInvalidSessionID) {
		t.Fatalf("expected ErrInvalidSessionID on Delete, got %v", err)
	}
}

func TestMemoryStore_Concurrency(t *testing.T) {
	m := NewMemoryStore()
	var wg sync.WaitGroup

	for i := 0; i < 100; i++ {
		wg.Add(4)
		id := fmt.Sprintf("concurrent-%d", i%10)
		go func(idx int) {
			defer wg.Done()
			_ = m.Save(Record{
				ID:       id,
				Title:    fmt.Sprintf("Title %d", idx),
				Messages: []llm.Message{{Role: "user", Content: fmt.Sprintf("msg %d", idx)}},
			})
		}(i)

		go func() {
			defer wg.Done()
			_, _ = m.Load(id)
		}()

		go func() {
			defer wg.Done()
			_, _ = m.List()
		}()

		go func(idx int) {
			defer wg.Done()
			if idx%3 == 0 {
				_ = m.Delete(id)
			}
		}(i)
	}

	wg.Wait()
}
