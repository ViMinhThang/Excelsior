package config

import (
	"errors"
	"fmt"
)

var (
	// ErrMissingAPIKey is returned when the DEEPSEEK_API_KEY is unset or whitespace.
	ErrMissingAPIKey = errors.New("DEEPSEEK_API_KEY is required")

	// ErrMissingModel is returned when the model is unset or empty.
	ErrMissingModel = errors.New("model is required")

	// ErrInvalidBaseURL is returned when the base URL fails parsing or has an unsupported scheme.
	ErrInvalidBaseURL = errors.New("invalid BaseURL")

	// ErrInvalidTemperature is returned when temperature is outside the valid range [0.0, 2.0].
	ErrInvalidTemperature = errors.New("invalid temperature")

	// ErrInvalidWorkspace is returned when workspace path cannot be resolved or accessed.
	ErrInvalidWorkspace = errors.New("invalid workspace")

	// ErrWorkspaceNotFound is returned when the workspace directory does not exist on disk.
	ErrWorkspaceNotFound = errors.New("workspace directory not found")

	// ErrWorkspaceNotDir is returned when the workspace path points to a file instead of a directory.
	ErrWorkspaceNotDir = errors.New("workspace path is not a directory")

	// ErrNotADirectory is an alias sentinel for ErrWorkspaceNotDir.
	ErrNotADirectory = ErrWorkspaceNotDir

	// ErrInvalidPermission is returned when permission mode is not ask|allow|deny.
	ErrInvalidPermission = errors.New("invalid permission mode")
)

// ConfigError represents a structured configuration or validation failure.
type ConfigError struct {
	Field   string // e.g. "APIKey", "Model", "BaseURL", "Temperature", "Workspace"
	Value   any    // The invalid value provided
	Message string // Human-readable explanation
	Err     error  // Sentinel error or underlying system error
}

func (e *ConfigError) Error() string {
	if e.Message != "" {
		if e.Err != nil {
			return fmt.Sprintf("%s: %v", e.Message, e.Err)
		}
		return e.Message
	}
	if e.Field != "" {
		if e.Err != nil {
			return fmt.Sprintf("config: %s: %v", e.Field, e.Err)
		}
		return fmt.Sprintf("config: invalid %s", e.Field)
	}
	if e.Err != nil {
		return fmt.Sprintf("config: %v", e.Err)
	}
	return "config error"
}

func (e *ConfigError) Unwrap() error {
	return e.Err
}

func (e *ConfigError) Is(target error) bool {
	if target == nil {
		return false
	}
	if errors.Is(e.Err, target) {
		return true
	}
	switch target {
	case ErrMissingAPIKey:
		return e.Field == "APIKey" || errors.Is(e.Err, ErrMissingAPIKey)
	case ErrMissingModel:
		return e.Field == "Model" || errors.Is(e.Err, ErrMissingModel)
	case ErrInvalidBaseURL:
		return e.Field == "BaseURL" || errors.Is(e.Err, ErrInvalidBaseURL)
	case ErrInvalidTemperature:
		return e.Field == "Temperature" || errors.Is(e.Err, ErrInvalidTemperature)
	case ErrInvalidWorkspace, ErrWorkspaceNotFound, ErrWorkspaceNotDir:
		return e.Field == "Workspace" && errors.Is(e.Err, target)
	default:
		return false
	}
}
