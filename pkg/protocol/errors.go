package protocol

import "errors"

var (
	ErrUnsupportedVersion = errors.New("protocol: unsupported version")
	ErrInvalidPayload     = errors.New("protocol: invalid payload")
	ErrCorruptEnvelope    = errors.New("protocol: corrupt message envelope")
	ErrUnknownType        = errors.New("protocol: unknown message type")
)
