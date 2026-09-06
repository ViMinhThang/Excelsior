package sqlite

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"excelsior/pkg/db"
	"excelsior/pkg/llm"
	"excelsior/pkg/session"
)

func setupTestDB(t *testing.T) (*Store, *Store) {
	t.Helper()
	tmpDir := t.TempDir()
	database, err := db.Open(filepath.Join(tmpDir, "test_session.db"))
	if err != nil {
		t.Fatalf("setup db failed: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	// Insert two test users
	_, err = database.Exec(`INSERT INTO users(id, username, password_hash) VALUES(1, 'alice', 'h1'), (2, 'bob', 'h2')`)
	if err != nil {
		t.Fatalf("seed users failed: %v", err)
	}

	return New(database, 1), New(database, 2)
}

func TestSQLiteStore_SaveAndLoad(t *testing.T) {
	aliceStore, bobStore := setupTestDB(t)

	// 1. Empty session ID
	err := aliceStore.Save(session.Record{ID: ""})
	if !errors.Is(err, session.ErrEmptySessionID) {
		t.Fatalf("expected ErrEmptySessionID, got %v", err)
	}

	// 2. Save valid session
	rec := session.Record{
		ID:    "sess-1",
		Title: "Test Chat",
		Messages: []llm.Message{
			{Role: "user", Content: "hello"},
			{Role: "assistant", Content: "world"},
		},
	}
	if err := aliceStore.Save(rec); err != nil {
		t.Fatalf("save failed: %v", err)
	}

	// 3. Load by owner
	loaded, err := aliceStore.Load("sess-1")
	if err != nil {
		t.Fatalf("load failed: %v", err)
	}
	if loaded.ID != "sess-1" || loaded.Title != "Test Chat" || len(loaded.Messages) != 2 {
		t.Fatalf("loaded session mismatch: %+v", loaded)
	}

	// 4. Update session
	rec.Title = "Updated Chat"
	rec.Messages = append(rec.Messages, llm.Message{Role: "user", Content: "new"})
	if err := aliceStore.Save(rec); err != nil {
		t.Fatalf("save update failed: %v", err)
	}
	loaded, err = aliceStore.Load("sess-1")
	if err != nil || loaded.Title != "Updated Chat" || len(loaded.Messages) != 3 {
		t.Fatalf("updated session mismatch: %+v, err: %v", loaded, err)
	}

	// 5. Tenant isolation: Bob cannot load Alice's session
	_, err = bobStore.Load("sess-1")
	if !errors.Is(err, session.ErrSessionNotFound) {
		t.Fatalf("expected ErrSessionNotFound for non-owner, got %v", err)
	}

	// 6. Non-existent session
	_, err = aliceStore.Load("non-existent")
	if !errors.Is(err, session.ErrSessionNotFound) {
		t.Fatalf("expected ErrSessionNotFound, got %v", err)
	}
}

func TestSQLiteStore_ListDeleteLatest(t *testing.T) {
	aliceStore, bobStore := setupTestDB(t)

	// Latest on empty store
	_, err := aliceStore.Latest()
	if !errors.Is(err, session.ErrSessionNotFound) {
		t.Fatalf("expected ErrSessionNotFound on empty store, got %v", err)
	}

	// Save two sessions for Alice
	s1 := session.Record{ID: "alice-1", Title: "Alice First"}
	s2 := session.Record{ID: "alice-2", Title: "Alice Second"}
	_ = aliceStore.Save(s1)
	time.Sleep(10 * time.Millisecond) // ensure distinct timestamp
	_ = aliceStore.Save(s2)

	// Save one session for Bob
	sBob := session.Record{ID: "bob-1", Title: "Bob Session"}
	_ = bobStore.Save(sBob)

	// Alice list
	metas, err := aliceStore.List()
	if err != nil {
		t.Fatalf("alice list failed: %v", err)
	}
	if len(metas) != 2 {
		t.Fatalf("expected 2 sessions for Alice, got %d", len(metas))
	}
	// Verify ordered by updated_at DESC (s2 was saved second)
	if metas[0].ID != "alice-2" {
		t.Fatalf("expected first listed session to be alice-2, got %s", metas[0].ID)
	}

	// Latest for Alice
	latest, err := aliceStore.Latest()
	if err != nil {
		t.Fatalf("alice latest failed: %v", err)
	}
	if latest.ID != "alice-2" {
		t.Fatalf("expected latest to be alice-2, got %s", latest.ID)
	}

	// Delete
	if err := aliceStore.Delete("alice-2"); err != nil {
		t.Fatalf("alice delete failed: %v", err)
	}
	metasAfter, err := aliceStore.List()
	if err != nil || len(metasAfter) != 1 || metasAfter[0].ID != "alice-1" {
		t.Fatalf("unexpected list after delete: %+v", metasAfter)
	}

	// Bob should still have his session
	bobMetas, err := bobStore.List()
	if err != nil || len(bobMetas) != 1 || bobMetas[0].ID != "bob-1" {
		t.Fatalf("unexpected bob list: %+v", bobMetas)
	}
}
