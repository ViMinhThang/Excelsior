package session

import (
	"errors"
	"fmt"
	"strings"
)

var (
	// ErrSessionNotFound is returned when attempting to load a session file that does not exist.
	ErrSessionNotFound = errors.New("session not found")

	// ErrInvalidSessionID is returned when a session ID contains illegal characters or path traversal elements.
	ErrInvalidSessionID = errors.New("invalid session id")

	// ErrEmptySessionID is returned when a session ID is empty or whitespace.
	ErrEmptySessionID = errors.New("session id is empty")

	// ErrCorruptedSession is returned when a session file contains data but no valid JSON record could be decoded.
	ErrCorruptedSession = errors.New("session file corrupted")

	// ErrEmptySession is returned when a session file exists on disk but is 0 bytes or whitespace only.
	ErrEmptySession = errors.New("session is empty")

	// ErrStoreDirEmpty is returned when Store.Dir is empty or unconfigured.
	ErrStoreDirEmpty = errors.New("session store dir is empty")

	// ErrEmptyStoreDir is an alias sentinel for ErrStoreDirEmpty.
	ErrEmptyStoreDir = ErrStoreDirEmpty
)

// SessionError represents a structured session storage error.
type SessionError struct {
	Op        string // "load", "save", "delete", "list", "prune", "rename", "validate", "path"
	SessionID string // Session identifier when applicable
	Path      string // File path on disk when applicable
	Msg       string // Optional message
	Err       error  // Underlying cause or sentinel error
}

func (e *SessionError) Error() string {
	var b strings.Builder
	b.WriteString("session")
	if e.Op != "" {
		b.WriteString(" [")
		b.WriteString(e.Op)
		if e.SessionID != "" {
			fmt.Fprintf(&b, " id=%s", e.SessionID)
		}
		b.WriteString("]")
	}
	if e.Path != "" {
		fmt.Fprintf(&b, " (%s)", e.Path)
	}
	if e.Msg != "" {
		b.WriteString(": ")
		b.WriteString(e.Msg)
		if e.Err != nil {
			b.WriteString(": ")
			b.WriteString(e.Err.Error())
		}
	} else if e.Err != nil {
		b.WriteString(": ")
		b.WriteString(e.Err.Error())
	}
	return b.String()
}

func (e *SessionError) Unwrap() error {
	return e.Err
}

func (e *SessionError) Is(target error) bool {
	if target == nil {
		return false
	}
	if errors.Is(e.Err, target) {
		return true
	}
	switch target {
	case ErrSessionNotFound:
		return errors.Is(e.Err, ErrSessionNotFound)
	case ErrInvalidSessionID:
		return errors.Is(e.Err, ErrInvalidSessionID) || errors.Is(e.Err, ErrEmptySessionID)
	case ErrEmptySessionID:
		return errors.Is(e.Err, ErrEmptySessionID)
	case ErrCorruptedSession:
		return errors.Is(e.Err, ErrCorruptedSession)
	case ErrEmptySession:
		return errors.Is(e.Err, ErrEmptySession)
	case ErrStoreDirEmpty:
		return errors.Is(e.Err, ErrStoreDirEmpty)
	default:
		return false
	}
}
