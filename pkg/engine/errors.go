package engine

import (
	"errors"
	"fmt"
	"strings"
)

var (
	// ErrAlreadyStreaming is returned when a chat.req is received while a streaming turn is already active.
	ErrAlreadyStreaming = errors.New("already streaming, wait for done")

	// ErrConnectionClosed is returned when an operation fails because the connection was closed.
	ErrConnectionClosed = errors.New("connection closed")

	// ErrClientDisconnected is returned when the remote client closes or aborts the connection.
	ErrClientDisconnected = errors.New("client disconnected")

	// ErrSendBufferFull is returned when the outbound send buffer is saturated.
	ErrSendBufferFull = errors.New("send buffer full")

	// ErrRemoteEngine is returned when the remote engine responds with a TypeError envelope.
	ErrRemoteEngine = errors.New("remote engine error")

	// ErrInvalidURL is returned when an engine URL cannot be parsed.
	ErrInvalidURL = errors.New("invalid engine url")

	// ErrConnectionFailed is returned when dialing the engine WebSocket endpoint fails.
	ErrConnectionFailed = errors.New("failed to connect to engine")
)

// EngineError represents a structured WebSocket engine or client error.
type EngineError struct {
	Op       string // "dial", "read", "write", "chat", "session", "ask"
	ClientID string // Remote client identifier or address
	MsgType  string // Protocol message type if applicable
	Msg      string // Optional human-readable message
	Err      error  // Underlying cause or sentinel error
}

func (e *EngineError) Error() string {
	var b strings.Builder
	b.WriteString("engine")
	if e.Op != "" {
		b.WriteString(" [")
		b.WriteString(e.Op)
		if e.ClientID != "" {
			fmt.Fprintf(&b, " client=%s", e.ClientID)
		}
		if e.MsgType != "" {
			fmt.Fprintf(&b, " type=%s", e.MsgType)
		}
		b.WriteString("]")
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

func (e *EngineError) Unwrap() error {
	return e.Err
}

func (e *EngineError) Is(target error) bool {
	if target == nil {
		return false
	}
	return errors.Is(e.Err, target) // ponytail ultra: stdlib already does traversal
}
