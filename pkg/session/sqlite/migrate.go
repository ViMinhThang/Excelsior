package sqlite

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"excelsior/pkg/llm"
	"excelsior/pkg/session"
)

// MigrateFromDirStore imports legacy .jsonl files from dir into this user's sqlite store.
// It is idempotent — existing ids are skipped.
func (s *Store) MigrateFromDirStore(dir string) (int, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	migrated := 0
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".jsonl" {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".jsonl")
		// skip if already in sqlite for this user
		var exists int
		_ = s.db.QueryRow(`SELECT COUNT(*) FROM sessions WHERE id=? AND user_id=?`, id, s.userID).Scan(&exists)
		if exists > 0 {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		b = bytes.TrimSpace(b)
		if len(b) == 0 {
			continue
		}
		lines := bytes.Split(b, []byte{'\n'})
		var rec session.Record
		found := false
		for i := len(lines) - 1; i >= 0; i-- {
			line := bytes.TrimSpace(lines[i])
			if len(line) == 0 {
				continue
			}
			// try as Record first, fallback to messages array
			if err := json.Unmarshal(line, &rec); err == nil && rec.ID != "" {
				found = true
				break
			}
			var msgs []llm.Message
			if err := json.Unmarshal(line, &msgs); err == nil {
				rec = session.Record{ID: id, Messages: msgs}
				found = true
				break
			}
		}
		if !found {
			continue
		}
		if rec.ID == "" {
			rec.ID = id
		}
		if err := s.Save(rec); err == nil {
			migrated++
		}
	}
	return migrated, nil
}

// MigrateAllUsers scans dir and imports into the correct owner's store is not needed
// for local-first: call MigrateFromDirStore for the logged-in user only. Provide helper for startup.
func MigrateForUser(db *sql.DB, userID int64, dir string) (int, error) {
	return New(db, userID).MigrateFromDirStore(dir)
}
