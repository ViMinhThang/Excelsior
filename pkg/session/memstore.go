package session

import (
	"fmt"
	"sort"
	"sync"
	"time"

	"excelsior/pkg/llm"
)

// MemoryStore is a thread-safe in-memory implementation of [Store], ideal for unit/integration tests.
type MemoryStore struct {
	mu       sync.RWMutex
	sessions map[string]Record
}

// Compile-time interface check.
var _ Store = (*MemoryStore)(nil)

// NewMemoryStore initializes an empty in-memory session store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		sessions: make(map[string]Record),
	}
}

// Save stores a deep copy of the record in memory.
func (m *MemoryStore) Save(rec Record) error {
	safeID, err := sanitizeID(rec.ID)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	if rec.CreatedAt.IsZero() {
		if existing, ok := m.sessions[safeID]; ok && !existing.CreatedAt.IsZero() {
			rec.CreatedAt = existing.CreatedAt
		} else {
			rec.CreatedAt = time.Now().UTC()
		}
	}
	rec.UpdatedAt = time.Now().UTC()
	rec.ID = safeID

	// Deep copy messages
	msgsCopy := make([]llm.Message, len(rec.Messages))
	copy(msgsCopy, rec.Messages)
	rec.Messages = msgsCopy

	m.sessions[safeID] = rec
	return nil
}

// Load retrieves a deep copy of the record for id.
func (m *MemoryStore) Load(id string) (Record, error) {
	safeID, err := sanitizeID(id)
	if err != nil {
		return Record{}, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	rec, ok := m.sessions[safeID]
	if !ok {
		return Record{}, fmt.Errorf("session load %q: %w", id, ErrSessionNotFound)
	}

	// Deep copy messages before returning
	msgsCopy := make([]llm.Message, len(rec.Messages))
	copy(msgsCopy, rec.Messages)
	rec.Messages = msgsCopy

	return rec, nil
}

// List returns metadata summaries for all sessions, sorted by UpdatedAt descending.
func (m *MemoryStore) List() ([]SessionMeta, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	metas := make([]SessionMeta, 0, len(m.sessions))
	for _, rec := range m.sessions {
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

// Delete removes the session from memory. Delete is idempotent.
func (m *MemoryStore) Delete(id string) error {
	safeID, err := sanitizeID(id)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.sessions, safeID)
	return nil
}

// Latest returns the most recently updated session. Returns ErrSessionNotFound if empty.
func (m *MemoryStore) Latest() (Record, error) {
	return Latest(m)
}

// Clear resets all stored sessions (useful in test cleanup).
func (m *MemoryStore) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions = make(map[string]Record)
}
