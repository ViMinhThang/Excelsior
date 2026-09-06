package agent

import "errors"

var (
	ErrContextTooLarge      = errors.New("context too large")
	ErrEmptyMessages        = errors.New("Messages is empty")
	ErrLLMNotConfigured     = errors.New("LLM not configured")
	ErrInvalidMaxIterations = errors.New("MaxIters must be >=0")
	ErrNilLLMMessage        = errors.New("LLM provider returned nil message")
)
