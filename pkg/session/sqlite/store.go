package sqlite

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"excelsior/pkg/llm"
	"excelsior/pkg/session"
)

// Store implements session.Store scoped to a single user.
type Store struct {
	db     *sql.DB
	userID int64
}

// New returns a user-scoped store. userID comes from auth.ValidateToken.
func New(db *sql.DB, userID int64) *Store { return &Store{db: db, userID: userID} }

var _ session.Store = (*Store)(nil)

func (s *Store) Save(rec session.Record) error {
	if strings.TrimSpace(rec.ID) == "" {
		return fmt.Errorf("session save: %w", session.ErrEmptySessionID)
	}
	if rec.CreatedAt.IsZero() {
		rec.CreatedAt = time.Now().UTC()
	}
	rec.UpdatedAt = time.Now().UTC()
	if rec.Messages == nil {
		rec.Messages = []llm.Message{}
	}
	data, err := json.Marshal(rec.Messages)
	if err != nil {
		return fmt.Errorf("session save %q marshal: %w", rec.ID, err)
	}
	title := strings.TrimSpace(rec.Title)
	now := rec.UpdatedAt.Format(time.RFC3339Nano)
	created := rec.CreatedAt.Format(time.RFC3339Nano)
	_, err = s.db.Exec(
		`INSERT INTO sessions(id,user_id,title,data,created_at,updated_at) VALUES(?,?,?,?,?,?)
		 ON CONFLICT(id) DO UPDATE SET title=excluded.title, data=excluded.data, updated_at=excluded.updated_at
		 WHERE sessions.user_id=?`,
		rec.ID, s.userID, title, string(data), created, now, s.userID,
	)
	if err != nil {
		return fmt.Errorf("session save %q: %w", rec.ID, err)
	}
	// If conflict did not update (wrong owner), verify ownership by checking rows
	// Fallback: ensure row exists and belongs to user
	var exists int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM sessions WHERE id=? AND user_id=?`, rec.ID, s.userID).Scan(&exists)
	if exists == 0 {
		// First insert may have been ignored due to WHERE clause on conflict -> do plain insert
		_, err = s.db.Exec(`INSERT OR REPLACE INTO sessions(id,user_id,title,data,created_at,updated_at) VALUES(?,?,?,?,?,?)`,
			rec.ID, s.userID, title, string(data), created, now)
		if err != nil {
			return fmt.Errorf("session save %q: %w", rec.ID, err)
		}
	}
	return nil
}

func (s *Store) Load(id string) (session.Record, error) {
	var title, data, createdStr, updatedStr string
	var uid int64
	err := s.db.QueryRow(`SELECT user_id,title,data,created_at,updated_at FROM sessions WHERE id=?`, id).
		Scan(&uid, &title, &data, &createdStr, &updatedStr)
	if err != nil {
		if err == sql.ErrNoRows {
			return session.Record{}, fmt.Errorf("session load %q: %w", id, session.ErrSessionNotFound)
		}
		return session.Record{}, fmt.Errorf("session load %q: %w", id, err)
	}
	if uid != s.userID {
		return session.Record{}, fmt.Errorf("session load %q: %w: not owner", id, session.ErrSessionNotFound)
	}
	var msgs []llm.Message
	if strings.TrimSpace(data) != "" && data != "null" {
		_ = json.Unmarshal([]byte(data), &msgs)
	}
	if msgs == nil {
		msgs = []llm.Message{}
	}
	created, _ := time.Parse(time.RFC3339Nano, createdStr)
	updated, _ := time.Parse(time.RFC3339Nano, updatedStr)
	if created.IsZero() {
		created, _ = time.Parse(time.RFC3339, createdStr)
	}
	if updated.IsZero() {
		updated, _ = time.Parse(time.RFC3339, updatedStr)
	}
	return session.Record{ID: id, Title: title, Messages: msgs, CreatedAt: created, UpdatedAt: updated}, nil
}

func (s *Store) List() ([]session.SessionMeta, error) {
	rows, err := s.db.Query(`SELECT id,title,created_at,updated_at,data FROM sessions WHERE user_id=? ORDER BY updated_at DESC`, s.userID)
	if err != nil {
		return nil, fmt.Errorf("session list: %w", err)
	}
	defer rows.Close()
	var out []session.SessionMeta
	for rows.Next() {
		var id, title, createdStr, updatedStr, data string
		if err := rows.Scan(&id, &title, &createdStr, &updatedStr, &data); err != nil {
			continue
		}
		created, _ := time.Parse(time.RFC3339Nano, createdStr)
		updated, _ := time.Parse(time.RFC3339Nano, updatedStr)
		var msgs []llm.Message
		_ = json.Unmarshal([]byte(data), &msgs)
		out = append(out, session.SessionMeta{ID: id, Title: title, CreatedAt: created, UpdatedAt: updated, MsgCount: len(msgs)})
	}
	return out, rows.Err()
}

func (s *Store) Delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE id=? AND user_id=?`, id, s.userID)
	if err != nil {
		return fmt.Errorf("session delete %q: %w", id, err)
	}
	return nil
}

func (s *Store) Latest() (session.Record, error) {
	var id string
	err := s.db.QueryRow(`SELECT id FROM sessions WHERE user_id=? ORDER BY updated_at DESC LIMIT 1`, s.userID).Scan(&id)
	if err != nil {
		if err == sql.ErrNoRows {
			return session.Record{}, fmt.Errorf("session latest: %w", session.ErrSessionNotFound)
		}
		return session.Record{}, fmt.Errorf("session latest: %w", err)
	}
	return s.Load(id)
}
