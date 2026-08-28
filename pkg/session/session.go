package session

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"excelsior/pkg/llm"
)

// Store is intentionally new: content-addressed JSONL per session.
// Each turn appends one JSON line; head is truncated on read. No checkpoints,
// no projections. This keeps persistence trivial and git-friendly if needed.
type Store struct {
	Dir string // e.g. .excelsior/sessions
}

func NewStore(dir string) *Store { return &Store{Dir: dir} }

type Record struct {
	ID        string       `json:"id"`
	CreatedAt time.Time    `json:"createdAt"`
	Messages  []llm.Message `json:"messages"`
}

func (s *Store) path(id string) string { return filepath.Join(s.Dir, id+".jsonl") }

func (s *Store) Save(id string, messages []llm.Message) error {
	if err := os.MkdirAll(s.Dir, 0o755); err != nil {
		return err
	}
	rec := Record{ID: id, CreatedAt: time.Now(), Messages: messages}
	b, _ := json.Marshal(rec)
	f, err := os.OpenFile(s.path(id), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.Write(append(b, '\n')); err != nil {
		return err
	}
	return nil
}

func (s *Store) Load(id string) ([]llm.Message, error) {
	b, err := os.ReadFile(s.path(id))
	if err != nil {
		return nil, fmt.Errorf("session load: %w", err)
	}
	lines := splitLines(string(b))
	if len(lines) == 0 {
		return nil, fmt.Errorf("session empty")
	}
	var rec Record
	if err := json.Unmarshal([]byte(lines[len(lines)-1]), &rec); err != nil {
		return nil, err
	}
	return rec.Messages, nil
}

func (s *Store) List() ([]string, error) {
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if filepath.Ext(e.Name()) == ".jsonl" {
			out = append(out, e.Name()[:len(e.Name())-6])
		}
	}
	return out, nil
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
