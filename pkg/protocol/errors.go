package protocol

import (
	"errors"
	"fmt"
)

var (
	// ErrUnsupportedVersion is returned when a client envelope contains an unrecognized protocol version.
	ErrUnsupportedVersion = errors.New("protocol: unsupported version")

	// ErrInvalidPayload is returned when a payload fails JSON marshaling or unmarshaling into the expected target.
	ErrInvalidPayload = errors.New("protocol: invalid payload")

	// ErrCorruptEnvelope is returned when an incoming frame cannot be parsed as a valid protocol.Envelope JSON.
	ErrCorruptEnvelope = errors.New("protocol: corrupt message envelope")

	// ErrMarshalFailed is returned when payload serialization fails.
	ErrMarshalFailed = errors.New("protocol: marshal payload failed")

	// ErrUnmarshalFailed is returned when payload deserialization fails.
	ErrUnmarshalFailed = errors.New("protocol: unmarshal payload failed")

	// ErrUnknownType is returned when an envelope has an unknown message type.
	ErrUnknownType = errors.New("protocol: unknown message type")
)

// ProtocolError represents a structured serialization or protocol compliance error.
type ProtocolError struct {
	Op      string // "marshal", "decode", "validate"
	MsgType string // Message type (e.g. "chat.req", "delta", "ask.req")
	Ver     string // Protocol version received
	Msg     string // Optional human-readable message
	Err     error  // Underlying cause or sentinel error
}

func (e *ProtocolError) Error() string {
	meta := ""
	if e.Op != "" {
		meta = " [" + e.Op
		if e.MsgType != "" {
			meta += fmt.Sprintf(" type=%s", e.MsgType)
		}
		if e.Ver != "" {
			meta += fmt.Sprintf(" ver=%s", e.Ver)
		}
		meta += "]"
	}
	base := "protocol" + meta
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

func (e *ProtocolError) Unwrap() error {
	return e.Err
}

func (e *ProtocolError) Is(target error) bool {
	if target == nil {
		return false
	}
	return errors.Is(e.Err, target) // ponytail ultra: exact match, no cross-sentinel grouping
}
