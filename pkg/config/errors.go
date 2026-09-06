package config

import "errors"

var (
	ErrMissingAPIKey      = errors.New("DEEPSEEK_API_KEY is required")
	ErrMissingModel       = errors.New("model is required")
	ErrInvalidBaseURL     = errors.New("invalid BaseURL")
	ErrInvalidTemperature = errors.New("invalid temperature")
	ErrInvalidWorkspace   = errors.New("invalid workspace")
	ErrWorkspaceNotFound  = errors.New("workspace directory not found")
	ErrWorkspaceNotDir    = errors.New("workspace path is not a directory")
	ErrInvalidPermission  = errors.New("invalid permission mode")
)
