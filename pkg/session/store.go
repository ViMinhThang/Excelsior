package session

import (
	"time"

	"excelsior/pkg/llm"
)

// Record is the domain model representing a persisted conversation session.
type Record struct {
	ID        string        `json:"id"`
	Title     string        `json:"title,omitempty"`
	CreatedAt time.Time     `json:"createdAt"`
	UpdatedAt time.Time     `json:"updatedAt,omitempty"`
	Messages  []llm.Message `json:"messages"`
}

// SessionMeta provides lightweight metadata summary for session listings.
type SessionMeta struct {
	ID        string    `json:"id"`
	Title     string    `json:"title,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt,omitempty"`
	MsgCount  int       `json:"msgCount,omitempty"`
}

// Store defines the storage port for persisting and retrieving chat sessions.
// Implementations must be safe for concurrent use.
type Store interface {
	// Save creates or updates the session record.
	Save(rec Record) error

	// Load retrieves a session record by ID. Returns ErrSessionNotFound if missing.
	Load(id string) (Record, error)

	// List returns metadata summaries for all sessions, ordered by most recently updated.
	List() ([]SessionMeta, error)

	// Delete removes a session record by ID. Delete is idempotent (missing ID is not an error).
	Delete(id string) error

	// Latest returns the most recently updated session record. Returns ErrSessionNotFound if empty.
	Latest() (Record, error)
}
