package db

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestDefaultPath(t *testing.T) {
	t.Run("with workspace", func(t *testing.T) {
		p := DefaultPath("myws")
		expected := filepath.Join("myws", ".excelsior", "excelsior.db")
		if p != expected {
			t.Fatalf("expected %s, got %s", expected, p)
		}
	})

	t.Run("empty workspace", func(t *testing.T) {
		p := DefaultPath("")
		expected := filepath.Join(".excelsior", "excelsior.db")
		if p != expected {
			t.Fatalf("expected %s, got %s", expected, p)
		}
	})
}

func TestOpenAndMigrate(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "sub", "test.db")

	database, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer database.Close()

	// Verify tables created
	tables := []string{"users", "tokens", "sessions"}
	for _, tbl := range tables {
		var name string
		err := database.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, tbl).Scan(&name)
		if err != nil || name != tbl {
			t.Fatalf("expected table %s to exist, got err: %v", tbl, err)
		}
	}

	// Verify pragmas
	var journalMode string
	if err := database.QueryRow(`PRAGMA journal_mode`).Scan(&journalMode); err != nil {
		t.Fatalf("query journal_mode: %v", err)
	}
	if strings.ToLower(journalMode) != "wal" {
		t.Fatalf("expected journal_mode=wal, got %s", journalMode)
	}

	var fk int
	if err := database.QueryRow(`PRAGMA foreign_keys`).Scan(&fk); err != nil {
		t.Fatalf("query foreign_keys: %v", err)
	}
	if fk != 1 {
		t.Fatalf("expected foreign_keys=1, got %d", fk)
	}

	// Verify idempotency by reopening
	db2, err := Open(dbPath)
	if err != nil {
		t.Fatalf("reopening database failed: %v", err)
	}
	_ = db2.Close()
}
