package session

import (
	"errors"
	"fmt"
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
	meta := ""
	if e.Op != "" {
		meta = " [" + e.Op
		if e.SessionID != "" {
			meta += fmt.Sprintf(" id=%s", e.SessionID)
		}
		meta += "]"
	}
	path := ""
	if e.Path != "" {
		path = fmt.Sprintf(" (%s)", e.Path)
	}
	base := "session" + meta + path
	if e.Msg != "" && e.Err != nil {
		return fmt.Sprintf("%s: %s: %v", base, e.Msg, e.Err)
	}
	if e.Msg != "" {
		return fmt.Sprintf("%s: %s", base, e.Msg)
	}
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", base, e.Err)
	}
	return base
}

func (e *SessionError) Unwrap() error {
	return e.Err
}

func (e *SessionError) Is(target error) bool {
	if target == nil {
		return false
	}
	return errors.Is(e.Err, target) // ponytail ultra: delete grouping, exact sentinel only
}
