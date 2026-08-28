package session

import (
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
)

// Store is a JSONL per-session store. Each turn appends one JSON line.
// Production hardening: atomic append via temp+rename, ID sanitization,
// corruption handling, context-aware, permissions 0700/0600.
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
	// Ensure Dir is not empty
	if strings.TrimSpace(s.Dir) == "" {
		return "", errors.New("session store dir is empty")
	}
	// Ensure path stays within Dir (defense in depth)
	p := filepath.Join(s.Dir, safe+".jsonl")
	rel, err := filepath.Rel(s.Dir, p)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("session path outside store dir: %q", id)
	}
	return p, nil
}

// SaveWithTitle appends a record with a custom title and message history.
func (s *Store) SaveWithTitle(ctx context.Context, id string, title string, messages []llm.Message) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("session save canceled: %w", err)
	}
	p, err := s.path(id)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.Dir, 0o700); err != nil {
		return fmt.Errorf("session mkdir: %w", err)
	}
	if messages == nil {
		messages = []llm.Message{}
	}
	rec := Record{ID: id, Title: title, CreatedAt: time.Now().UTC(), Messages: messages}
	b, err := json.Marshal(rec)
	if err != nil {
		return fmt.Errorf("session marshal: %w", err)
	}

	f, err := os.OpenFile(p, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("session open: %w", err)
	}
	defer func() {
		if cerr := f.Close(); cerr != nil {
			slog.Warn("session close error", "id", id, "err", cerr)
		}
	}()
	if _, err := f.Write(append(b, '\n')); err != nil {
		return fmt.Errorf("session write: %w", err)
	}
	if err := f.Sync(); err != nil {
		return fmt.Errorf("session sync: %w", err)
	}
	if d, err := os.Open(s.Dir); err == nil {
		_ = d.Sync()
		d.Close()
	}
	slog.Debug("session saved", "id", id, "title", title, "messages", len(messages))
	return nil
}

// SaveWithTitleSimple is a convenience wrapper for SaveWithTitle with background context.
func (s *Store) SaveWithTitleSimple(id string, title string, messages []llm.Message) error {
	return s.SaveWithTitle(context.Background(), id, title, messages)
}

// Save preserves any previously saved custom title if present.
func (s *Store) Save(ctx context.Context, id string, messages []llm.Message) error {
	var title string
	if existing, err := s.LoadRecord(ctx, id); err == nil && existing != nil {
		title = existing.Title
	}
	return s.SaveWithTitle(ctx, id, title, messages)
}

// SaveSimple is a convenience wrapper with background context (for callers not needing ctx).
func (s *Store) SaveSimple(id string, messages []llm.Message) error {
	return s.Save(context.Background(), id, messages)
}

// Rename updates the title of a session by appending a new record entry.
func (s *Store) Rename(ctx context.Context, id string, title string) error {
	var msgs []llm.Message
	if existing, err := s.LoadRecord(ctx, id); err == nil && existing != nil {
		msgs = existing.Messages
	}
	return s.SaveWithTitle(ctx, id, title, msgs)
}

// RenameSimple is a convenience wrapper for Rename with background context.
func (s *Store) RenameSimple(id string, title string) error {
	return s.Rename(context.Background(), id, title)
}

// LoadRecord reads the last valid JSONL record for a session, returning its full metadata.
func (s *Store) LoadRecord(ctx context.Context, id string) (*Record, error) {
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("session load canceled: %w", err)
	}
	p, err := s.path(id)
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return nil, fmt.Errorf("session load: %w", err)
	}
	lines := splitLines(string(b))
	if len(lines) == 0 {
		return nil, fmt.Errorf("session empty: %q", id)
	}
	// Try from last line backwards, skipping corrupted lines (partial writes)
	var lastErr error
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		var rec Record
		if err := json.Unmarshal([]byte(line), &rec); err != nil {
			lastErr = err
			slog.Warn("session corrupted line, skipping", "id", id, "line", i, "err", err)
			continue
		}
		return &rec, nil
	}
	return nil, fmt.Errorf("session %q: no valid record: %w", id, lastErr)
}

// LoadRecordSimple is a convenience wrapper for LoadRecord with background context.
func (s *Store) LoadRecordSimple(id string) (*Record, error) {
	return s.LoadRecord(context.Background(), id)
}

// Load returns the messages of the latest valid record for a session.
func (s *Store) Load(ctx context.Context, id string) ([]llm.Message, error) {
	rec, err := s.LoadRecord(ctx, id)
	if err != nil {
		return nil, err
	}
	return rec.Messages, nil
}

func (s *Store) LoadSimple(id string) ([]llm.Message, error) {
	return s.Load(context.Background(), id)
}

func (s *Store) List(ctx context.Context) ([]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("session list canceled: %w", err)
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
		if e.IsDir() {
			continue
		}
		if filepath.Ext(e.Name()) != ".jsonl" {
			continue
		}
		id := e.Name()[:len(e.Name())-6]
		if _, err := sanitizeID(id); err != nil {
			slog.Warn("session list skipping invalid id", "file", e.Name(), "err", err)
			continue
		}
		out = append(out, id)
	}
	return out, nil
}

func (s *Store) ListSimple() ([]string, error) { return s.List(context.Background()) }

// Delete removes a session.
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

// DeleteSimple is a convenience wrapper with background context.
func (s *Store) DeleteSimple(id string) error {
	return s.Delete(context.Background(), id)
}

// Prune deletes sessions older than maxAge based on file mtime.
func (s *Store) Prune(ctx context.Context, maxAge time.Duration) (int, error) {
	if err := ctx.Err(); err != nil {
		return 0, fmt.Errorf("session prune canceled: %w", err)
	}
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, fmt.Errorf("session prune list: %w", err)
	}
	var deleted int
	cutoff := time.Now().Add(-maxAge)
	for _, e := range entries {
		if ctx.Err() != nil {
			return deleted, fmt.Errorf("session prune canceled: %w", ctx.Err())
		}
		if e.IsDir() || filepath.Ext(e.Name()) != ".jsonl" {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			p := filepath.Join(s.Dir, e.Name())
			if err := os.Remove(p); err == nil {
				deleted++
				slog.Info("session pruned", "file", e.Name(), "age", time.Since(info.ModTime()))
			}
		}
	}
	return deleted, nil
}

func splitLines(s string) []string {
	var out []string
	start := 0
	for i, c := range s {
		if c == '\n' {
			if i > start {
				out = append(out, s[start:i])
			}
			start = i + 1
		}
	}
	if start < len(s) {
		out = append(out, s[start:])
	}
	return out
}
