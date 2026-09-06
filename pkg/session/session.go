package session

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"excelsior/pkg/llm"
	"excelsior/pkg/util"
)

// ponytail: single regex covers separators + traversal (was Contains checks + second regex + Rel check)
var validID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$`)

func sanitizeID(id string) (string, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", fmt.Errorf("session validate: %w", ErrEmptySessionID)
	}
	if !validID.MatchString(id) {
		return "", fmt.Errorf("session validate %q: %w", id, ErrInvalidSessionID)
	}
	return id, nil
}

// DirStore implements [Store] persisting sessions as atomic JSONL files on disk.
type DirStore struct {
	Dir string // Directory path e.g. .excelsior/sessions
	mu  sync.RWMutex
}

// Compile-time interface check.
var _ Store = (*DirStore)(nil)

// NewDirStore returns a DirStore rooted at dir.
func NewDirStore(dir string) *DirStore {
	return &DirStore{Dir: dir}
}

func (s *DirStore) path(id string) (string, error) {
	safe, err := sanitizeID(id)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(s.Dir) == "" {
		return "", fmt.Errorf("session path %q: %w", id, ErrStoreDirEmpty)
	}
	return filepath.Join(s.Dir, safe+".jsonl"), nil
}

// Save persists a session record atomically to disk.
func (s *DirStore) Save(rec Record) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, err := s.path(rec.ID)
	if err != nil {
		return err
	}
	if rec.CreatedAt.IsZero() {
		rec.CreatedAt = time.Now().UTC()
	}
	rec.UpdatedAt = time.Now().UTC()
	if rec.Messages == nil {
		rec.Messages = []llm.Message{}
	}

	b, err := json.Marshal(rec)
	if err != nil {
		return fmt.Errorf("session save %q: %w", rec.ID, err)
	}
	b = append(b, '\n')
	if err := util.WriteAtomic(p, b, 0o600); err != nil {
		return fmt.Errorf("session save %q: %w", rec.ID, err)
	}
	slog.Debug("session saved", "id", rec.ID, "title", rec.Title, "messages", len(rec.Messages))
	return nil
}

// ponytail: one last-valid-line parser shared by Load + List (was duplicated loops)
func lastRecord(b []byte) (Record, bool) {
	lines := bytes.Split(b, []byte{'\n'})
	for i := len(lines) - 1; i >= 0; i-- {
		line := bytes.TrimSpace(lines[i])
		if len(line) == 0 {
			continue
		}
		var rec Record
		if err := json.Unmarshal(line, &rec); err == nil {
			return rec, true
		}
	}
	return Record{}, false
}

// Load retrieves a session record by ID from disk.
func (s *DirStore) Load(id string) (Record, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	p, err := s.path(id)
	if err != nil {
		return Record{}, err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return Record{}, fmt.Errorf("session load %q: %w", id, ErrSessionNotFound)
		}
		return Record{}, fmt.Errorf("session load %q: %w", id, err)
	}
	if len(bytes.TrimSpace(b)) == 0 {
		return Record{}, fmt.Errorf("session load %q: %w", id, ErrEmptySession)
	}
	rec, found := lastRecord(b)
	if !found {
		return Record{}, fmt.Errorf("session load %q: %w", id, ErrCorruptedSession)
	}
	if rec.ID == "" {
		rec.ID = id
	}
	if rec.UpdatedAt.IsZero() {
		rec.UpdatedAt = rec.CreatedAt
	}
	return rec, nil
}

// List returns metadata summaries for all sessions, sorted by UpdatedAt descending.
func (s *DirStore) List() ([]SessionMeta, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if strings.TrimSpace(s.Dir) == "" {
		return nil, fmt.Errorf("session list: %w", ErrStoreDirEmpty)
	}
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("session list: %w", err)
	}
	var metas []SessionMeta
	for _, e := range entries {
		if meta := s.metaForEntry(e); meta != nil {
			metas = append(metas, *meta)
		}
	}
	sort.Slice(metas, func(i, j int) bool {
		return metas[i].UpdatedAt.After(metas[j].UpdatedAt)
	})
	return metas, nil
}

func (s *DirStore) metaForEntry(e os.DirEntry) *SessionMeta {
	if e.IsDir() || filepath.Ext(e.Name()) != ".jsonl" {
		return nil
	}
	id := strings.TrimSuffix(e.Name(), ".jsonl")
	if _, err := sanitizeID(id); err != nil {
		return nil
	}
	b, err := os.ReadFile(filepath.Join(s.Dir, e.Name()))
	if err != nil || len(bytes.TrimSpace(b)) == 0 {
		return nil
	}
	rec, found := lastRecord(b)
	if !found {
		return nil
	}
	if rec.ID == "" {
		rec.ID = id
	}
	updatedAt := rec.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = rec.CreatedAt
	}
	return &SessionMeta{
		ID:        rec.ID,
		Title:     rec.Title,
		CreatedAt: rec.CreatedAt,
		UpdatedAt: updatedAt,
		MsgCount:  len(rec.Messages),
	}
}

// Delete removes the session file for id. Missing files return nil (idempotent).
func (s *DirStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, err := s.path(id)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("session delete %q: %w", id, err)
	}
	slog.Info("session deleted", "id", id)
	return nil
}

// Latest returns the most recently updated session record.
func (s *DirStore) Latest() (Record, error) {
	return Latest(s)
}
