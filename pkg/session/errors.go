package session

import "errors"

var (
	ErrSessionNotFound  = errors.New("session not found")
	ErrInvalidSessionID = errors.New("invalid session id")
	ErrEmptySessionID   = errors.New("session id is empty")
	ErrCorruptedSession = errors.New("session file corrupted")
	ErrEmptySession     = errors.New("session is empty")
	ErrStoreDirEmpty    = errors.New("session store dir is empty")
)
