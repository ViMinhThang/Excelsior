package tools

import (
	"errors"
	"fmt"
)

var (
	// ErrToolNotFound is returned when a requested tool name is not registered.
	ErrToolNotFound = errors.New("tool not found")

	// ErrInvalidArguments is returned when tool argument JSON or parameters are invalid.
	ErrInvalidArguments = errors.New("invalid tool arguments")

	// ErrEmptyPath is returned when a provided path is empty or whitespace only.
	ErrEmptyPath = errors.New("path is empty")

	// ErrAbsolutePath is returned when an absolute path is passed to a workspace-jailed tool.
	ErrAbsolutePath = errors.New("absolute paths not allowed")

	// ErrPathOutsideWorkspace is returned when a target path escapes the workspace root.
	ErrPathOutsideWorkspace = errors.New("path outside workspace")

	// ErrFileTooLarge is returned when a file exceeds the allowed read or write size limit.
	ErrFileTooLarge = errors.New("file too large")

	// ErrCommandTooLong is returned when a shell command exceeds the length cap.
	ErrCommandTooLong = errors.New("command too long")

	// ErrCommandTimeout is returned when a shell command execution exceeds its timeout.
	ErrCommandTimeout = errors.New("command timed out")

	// ErrTextNotFound is returned when the target string in edit cannot be found.
	ErrTextNotFound = errors.New("oldText not found")

	// ErrAmbiguousMatch is returned when the target string in edit appears multiple times.
	ErrAmbiguousMatch = errors.New("oldText matched multiple times")

	// ErrNotADirectory is returned when a path expected to be a directory is not.
	ErrNotADirectory = errors.New("target path is not a directory")

	// ErrIsADirectory is returned when a path expected to be a file is a directory.
	ErrIsADirectory = errors.New("target path is a directory, not a file")

	// ErrOffsetOutOfRange is returned when a line offset exceeds file line count.
	ErrOffsetOutOfRange = errors.New("line offset out of range")

	// ErrPermissionDenied is defined in permission.go
)

// errf builds a tool error. Replaces &ToolError{...} literals site-wide.
func errf(tool, op, path string, err error) error {
	if path == "" {
		return fmt.Errorf("%s %s: %w", tool, op, err)
	}
	return fmt.Errorf("%s %s %q: %w", tool, op, path, err)
}
