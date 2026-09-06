package engine

import "errors"

var (
	ErrConnectionClosed  = errors.New("connection closed")
	ErrRemoteEngine      = errors.New("remote engine error")
	ErrInvalidURL        = errors.New("invalid engine url")
	ErrConnectionFailed  = errors.New("failed to connect to engine")
)
