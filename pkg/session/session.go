package session

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"excelsior/pkg/llm"
	"excelsior/pkg/util"
)

// Store is a per-session store. Each session is a single atomic JSON file
// (legacy JSONL multi-line files are read via last valid line for compat).
type Store struct {
	Dir string // e.g. .excelsior/sessions
}

func NewStore(dir string) *Store { return &Store{Dir: dir} }

type Record struct {
	ID        string        `json:"id"`
	Title     string        `json:"title,omitempty"`
	CreatedAt time.Time     `json:"createdAt"`
	Messages  []llm.Message `json:"messages"`
}

var validID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$`)

func sanitizeID(id string) (string, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", errors.New("session id is empty")
	}
	if strings.Contains(id, "/") || strings.Contains(id, "\\") || strings.Contains(id, "..") {
		return "", fmt.Errorf("invalid session id %q: must not contain path separators", id)
	}
	if !validID.MatchString(id) {
		return "", fmt.Errorf("invalid session id %q: must match %s", id, validID.String())
	}
	return id, nil
}

func (s *Store) path(id string) (string, error) {
	safe, err := sanitizeID(id)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(s.Dir) == "" {
		return "", errors.New("session store dir is empty")
	}
	p := filepath.Join(s.Dir, safe+".jsonl")
	rel, err := filepath.Rel(s.Dir, p)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("session path outside store dir: %q", id)
	}
	return p, nil
}

func checkCtx(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("session canceled: %w", err)
	}
	return nil
}

// SaveWithTitle overwrites the session file atomically.
func (s *Store) SaveWithTitle(ctx context.Context, id string, title string, messages []llm.Message) error {
	if err := checkCtx(ctx); err != nil {
		return err
	}
	p, err := s.path(id)
	if err != nil {
		return err
	}
	if messages == nil {
		messages = []llm.Message{}
	}
	rec := Record{ID: id, Title: title, CreatedAt: time.Now().UTC(), Messages: messages}
	b, err := json.Marshal(rec)
	if err != nil {
		return fmt.Errorf("session marshal: %w", err)
	}
	b = append(b, '\n')
	if err := util.WriteAtomic(p, b, 0o600); err != nil {
		return err
	}
	slog.Debug("session saved", "id", id, "title", title, "messages", len(messages))
	return nil
}

func (s *Store) Save(ctx context.Context, id string, messages []llm.Message) error {
	var title string
	if rec, err := s.LoadRecord(ctx, id); err == nil && rec != nil {
		title = rec.Title
	}
	return s.SaveWithTitle(ctx, id, title, messages)
}

func (s *Store) Rename(ctx context.Context, id, title string) error {
	var msgs []llm.Message
	if rec, err := s.LoadRecord(ctx, id); err == nil && rec != nil {
		msgs = rec.Messages
	}
	return s.SaveWithTitle(ctx, id, title, msgs)
}

func (s *Store) LoadRecord(ctx context.Context, id string) (*Record, error) {
	if err := checkCtx(ctx); err != nil {
		return nil, err
	}
	p, err := s.path(id)
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return nil, fmt.Errorf("session load: %w", err)
	}
	b = bytes.TrimSpace(b)
	if len(b) == 0 {
		return nil, fmt.Errorf("session empty: %q", id)
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
		return &rec, nil
	}
	if lastErr != nil {
		return nil, fmt.Errorf("session %q: no valid record: %w", id, lastErr)
	}
	return nil, fmt.Errorf("session empty: %q", id)
}

func (s *Store) Load(ctx context.Context, id string) ([]llm.Message, error) {
	rec, err := s.LoadRecord(ctx, id)
	if err != nil {
		return nil, err
	}
	return rec.Messages, nil
}

func sessionIDFromFile(e os.DirEntry) (string, bool) {
	if e.IsDir() || filepath.Ext(e.Name()) != ".jsonl" {
		return "", false
	}
	id := strings.TrimSuffix(e.Name(), ".jsonl")
	if _, err := sanitizeID(id); err != nil {
		slog.Warn("session list skipping invalid id", "file", e.Name(), "err", err)
		return "", false
	}
	return id, true
}

func (s *Store) List(ctx context.Context) ([]string, error) {
	if err := checkCtx(ctx); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("session list: %w", err)
	}
	var out []string
	for _, e := range entries {
		if id, ok := sessionIDFromFile(e); ok {
			out = append(out, id)
		}
	}
	return out, nil
}

func (s *Store) Delete(ctx context.Context, id string) error {
	p, err := s.path(id)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("session delete: %w", err)
	}
	slog.Info("session deleted", "id", id)
	return nil
}

func (s *Store) Prune(ctx context.Context, maxAge time.Duration) (int, error) {
	if err := checkCtx(ctx); err != nil {
		return 0, err
	}
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, fmt.Errorf("session prune list: %w", err)
	}
	cutoff := time.Now().Add(-maxAge)
	var deleted int
	for _, e := range entries {
		if ctx.Err() != nil {
			return deleted, fmt.Errorf("session prune canceled: %w", ctx.Err())
		}
		if _, ok := sessionIDFromFile(e); !ok {
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
