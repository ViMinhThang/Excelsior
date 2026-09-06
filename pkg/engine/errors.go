package engine

import "errors"

var (
	ErrAlreadyStreaming  = errors.New("already streaming, wait for done")
	ErrConnectionClosed  = errors.New("connection closed")
	ErrClientDisconnected = errors.New("client disconnected")
	ErrSendBufferFull    = errors.New("send buffer full")
	ErrRemoteEngine      = errors.New("remote engine error")
	ErrInvalidURL        = errors.New("invalid engine url")
	ErrConnectionFailed  = errors.New("failed to connect to engine")
)
