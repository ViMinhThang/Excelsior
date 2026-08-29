package session

import (
	"bytes"
	"context"
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

var validID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$`)

func sanitizeID(id string) (string, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", &SessionError{Op: "validate", Err: ErrEmptySessionID}
	}
	if strings.Contains(id, "/") || strings.Contains(id, "\\") || strings.Contains(id, "..") {
		return "", &SessionError{Op: "validate", SessionID: id, Err: fmt.Errorf("invalid session id %q: %w: must not contain path separators", id, ErrInvalidSessionID)}
	}
	if !validID.MatchString(id) {
		return "", &SessionError{Op: "validate", SessionID: id, Err: fmt.Errorf("invalid session id %q: %w: must match %s", id, ErrInvalidSessionID, validID.String())}
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

// NewStore is a constructor alias for NewDirStore.
func NewStore(dir string) *DirStore {
	return NewDirStore(dir)
}

// New is a constructor alias for NewDirStore.
func New(dir string) *DirStore {
	return NewDirStore(dir)
}

func (s *DirStore) path(id string) (string, error) {
	safe, err := sanitizeID(id)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(s.Dir) == "" {
		return "", &SessionError{Op: "path", SessionID: id, Err: ErrStoreDirEmpty}
	}
	p := filepath.Join(s.Dir, safe+".jsonl")
	rel, err := filepath.Rel(s.Dir, p)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", &SessionError{Op: "path", SessionID: id, Path: p, Err: fmt.Errorf("session path outside store dir: %q: %w", id, ErrInvalidSessionID)}
	}
	return p, nil
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
		return &SessionError{Op: "save", SessionID: rec.ID, Err: fmt.Errorf("session marshal: %w", err)}
	}
	b = append(b, '\n')
	if err := util.WriteAtomic(p, b, 0o600); err != nil {
		return &SessionError{Op: "save", SessionID: rec.ID, Path: p, Err: err}
	}
	slog.Debug("session saved", "id", rec.ID, "title", rec.Title, "messages", len(rec.Messages))
	return nil
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
			return Record{}, &SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("session load: %w: %v", ErrSessionNotFound, err)}
		}
		return Record{}, &SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("session load: %w", err)}
	}
	b = bytes.TrimSpace(b)
	if len(b) == 0 {
		return Record{}, &SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("session empty: %q: %w", id, ErrEmptySession)}
	}

	lines := bytes.Split(b, []byte{'\n'})
	var lastErr error
	for i := len(lines) - 1; i >= 0; i-- {
		line := bytes.TrimSpace(lines[i])
		if len(line) == 0 {
			continue
		}
		var rec Record
		if err := json.Unmarshal(line, &rec); err != nil {
			lastErr = err
			slog.Warn("session corrupted line, skipping", "id", id, "line", i, "err", err)
			continue
		}
		if rec.ID == "" {
			rec.ID = id
		}
		if rec.UpdatedAt.IsZero() {
			rec.UpdatedAt = rec.CreatedAt
		}
		return rec, nil
	}
	if lastErr != nil {
		return Record{}, &SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("session %q: no valid record: %w: %v", id, ErrCorruptedSession, lastErr)}
	}
	return Record{}, &SessionError{Op: "load", SessionID: id, Path: p, Err: fmt.Errorf("session empty: %q: %w", id, ErrEmptySession)}
}

// List returns metadata summaries for all sessions, sorted by UpdatedAt descending.
func (s *DirStore) List() ([]SessionMeta, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if strings.TrimSpace(s.Dir) == "" {
		return nil, &SessionError{Op: "list", Err: ErrStoreDirEmpty}
	}
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, &SessionError{Op: "list", Err: fmt.Errorf("session list: %w", err)}
	}

	var metas []SessionMeta
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".jsonl" {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".jsonl")
		if _, err := sanitizeID(id); err != nil {
			continue
		}
		// Load record to get accurate metadata
		p := filepath.Join(s.Dir, e.Name())
		b, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		b = bytes.TrimSpace(b)
		if len(b) == 0 {
			continue
		}
		lines := bytes.Split(b, []byte{'\n'})
		var rec Record
		found := false
		for i := len(lines) - 1; i >= 0; i-- {
			line := bytes.TrimSpace(lines[i])
			if len(line) == 0 {
				continue
			}
			if err := json.Unmarshal(line, &rec); err == nil {
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
		updatedAt := rec.UpdatedAt
		if updatedAt.IsZero() {
			updatedAt = rec.CreatedAt
		}
		metas = append(metas, SessionMeta{
			ID:        rec.ID,
			Title:     rec.Title,
			CreatedAt: rec.CreatedAt,
			UpdatedAt: updatedAt,
			MsgCount:  len(rec.Messages),
		})
	}

	sort.Slice(metas, func(i, j int) bool {
		return metas[i].UpdatedAt.After(metas[j].UpdatedAt)
	})
	return metas, nil
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
		return &SessionError{Op: "delete", SessionID: id, Path: p, Err: fmt.Errorf("session delete: %w", err)}
	}
	slog.Info("session deleted", "id", id)
	return nil
}

// Latest returns the most recently updated session record.
func (s *DirStore) Latest() (Record, error) {
	metas, err := s.List()
	if err != nil {
		return Record{}, err
	}
	if len(metas) == 0 {
		return Record{}, &SessionError{Op: "latest", Err: ErrSessionNotFound}
	}
	return s.Load(metas[0].ID)
}

// SaveWithTitle saves a session with a title and messages.
func (s *DirStore) SaveWithTitle(ctx context.Context, id, title string, messages []llm.Message) error {
	if err := ctx.Err(); err != nil {
		return &SessionError{Op: "save", SessionID: id, Err: err}
	}
	return s.Save(Record{ID: id, Title: title, Messages: messages})
}

// LoadRecord retrieves a pointer to Record for backward compatibility.
func (s *DirStore) LoadRecord(ctx context.Context, id string) (*Record, error) {
	if err := ctx.Err(); err != nil {
		return nil, &SessionError{Op: "load", SessionID: id, Err: err}
	}
	rec, err := s.Load(id)
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

// Rename updates the title of an existing session record.
func (s *DirStore) Rename(ctx context.Context, id, title string) error {
	if err := ctx.Err(); err != nil {
		return &SessionError{Op: "rename", SessionID: id, Err: err}
	}
	rec, err := s.Load(id)
	if err != nil {
		return err
	}
	rec.Title = title
	return s.Save(rec)
}

// Prune deletes sessions whose ModTime is older than maxAge and returns the count deleted.
func (s *DirStore) Prune(ctx context.Context, maxAge time.Duration) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if strings.TrimSpace(s.Dir) == "" {
		return 0, &SessionError{Op: "prune", Err: ErrStoreDirEmpty}
	}
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, &SessionError{Op: "prune", Err: fmt.Errorf("session prune list: %w", err)}
	}
	cutoff := time.Now().Add(-maxAge)
	var deleted int
	for _, e := range entries {
		if ctx.Err() != nil {
			return deleted, &SessionError{Op: "prune", Err: fmt.Errorf("session prune canceled: %w", ctx.Err())}
		}
		if e.IsDir() || filepath.Ext(e.Name()) != ".jsonl" {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			if err := os.Remove(filepath.Join(s.Dir, e.Name())); err == nil {
				deleted++
			}
		}
	}
	return deleted, nil
}
