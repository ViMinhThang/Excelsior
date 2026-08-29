package tools

import (
	"errors"
	"strings"
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

	// ErrOldTextNotFound is an alias sentinel for ErrTextNotFound.
	ErrOldTextNotFound = ErrTextNotFound

	// ErrAmbiguousMatch is returned when the target string in edit appears multiple times.
	ErrAmbiguousMatch = errors.New("oldText matched multiple times")

	// ErrOldTextAmbiguous is an alias sentinel for ErrAmbiguousMatch.
	ErrOldTextAmbiguous = ErrAmbiguousMatch

	// ErrNotADirectory is returned when a path expected to be a directory is not.
	ErrNotADirectory = errors.New("target path is not a directory")

	// ErrIsADirectory is returned when a path expected to be a file is a directory.
	ErrIsADirectory = errors.New("target path is a directory, not a file")

	// ErrOffsetOutOfRange is returned when a line offset exceeds file line count.
	ErrOffsetOutOfRange = errors.New("line offset out of range")
)

// ToolError is a structured error carrying tool name, operation, path, and underlying cause.
type ToolError struct {
	Tool string // "view", "edit", "write", "bash", "grep", "ls", "glob", "askQuestion"
	Op   string // "read", "write", "replace", "exec", "glob", "grep", "list", "prompt", "validate", "security", "stat"
	Path string // File or directory path when applicable
	Msg  string // Optional human-readable message
	Err  error  // Sentinel error or underlying system error
}

func (e *ToolError) Error() string {
	var b strings.Builder
	if e.Tool != "" {
		b.WriteString(e.Tool)
	} else {
		b.WriteString("tools")
	}
	if e.Op != "" {
		b.WriteString(": [")
		b.WriteString(e.Op)
		b.WriteString("]")
	}
	if e.Path != "" {
		b.WriteString(" ")
		b.WriteString(e.Path)
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

func (e *ToolError) Unwrap() error {
	return e.Err
}

func (e *ToolError) Is(target error) bool {
	if target == nil {
		return false
	}
	if errors.Is(e.Err, target) {
		return true
	}
	switch target {
	case ErrOldTextNotFound, ErrTextNotFound:
		return errors.Is(e.Err, ErrTextNotFound) || errors.Is(e.Err, ErrOldTextNotFound)
	case ErrOldTextAmbiguous, ErrAmbiguousMatch:
		return errors.Is(e.Err, ErrAmbiguousMatch) || errors.Is(e.Err, ErrOldTextAmbiguous)
	case ErrPathOutsideWorkspace:
		return errors.Is(e.Err, ErrPathOutsideWorkspace)
	case ErrAbsolutePath:
		return errors.Is(e.Err, ErrAbsolutePath)
	case ErrEmptyPath:
		return errors.Is(e.Err, ErrEmptyPath)
	case ErrInvalidArguments:
		return errors.Is(e.Err, ErrInvalidArguments)
	case ErrFileTooLarge:
		return errors.Is(e.Err, ErrFileTooLarge)
	case ErrCommandTooLong:
		return errors.Is(e.Err, ErrCommandTooLong)
	case ErrCommandTimeout:
		return errors.Is(e.Err, ErrCommandTimeout)
	case ErrNotADirectory:
		return errors.Is(e.Err, ErrNotADirectory)
	case ErrIsADirectory:
		return errors.Is(e.Err, ErrIsADirectory)
	case ErrOffsetOutOfRange:
		return errors.Is(e.Err, ErrOffsetOutOfRange)
	case ErrToolNotFound:
		return errors.Is(e.Err, ErrToolNotFound)
	default:
		return false
	}
}
