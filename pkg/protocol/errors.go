package protocol

import (
	"errors"
	"fmt"
	"strings"
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
	var b strings.Builder
	b.WriteString("protocol")
	if e.Op != "" {
		b.WriteString(" [")
		b.WriteString(e.Op)
		if e.MsgType != "" {
			fmt.Fprintf(&b, " type=%s", e.MsgType)
		}
		if e.Ver != "" {
			fmt.Fprintf(&b, " ver=%s", e.Ver)
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

func (e *ProtocolError) Unwrap() error {
	return e.Err
}

func (e *ProtocolError) Is(target error) bool {
	if target == nil {
		return false
	}
	return errors.Is(e.Err, target) // ponytail ultra: exact match, no cross-sentinel grouping
}
