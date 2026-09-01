package agent

import (
	"errors"
	"fmt"
)

var (
	// ErrMaxIterationsReached is returned when the agent loop hits the iteration limit.
	ErrMaxIterationsReached = errors.New("max iterations reached")

	// ErrContextTooLarge is returned when the input messages exceed the safety character limit.
	ErrContextTooLarge = errors.New("context too large")

	// ErrEmptyMessages is returned when Run or RunWithHistory is called with empty messages.
	ErrEmptyMessages = errors.New("Messages is empty")

	// ErrLLMNotConfigured is returned when the Agent has no LLM provider configured.
	ErrLLMNotConfigured = errors.New("LLM not configured")

	// ErrInvalidConfig is returned when Agent configuration is invalid.
	ErrInvalidConfig = errors.New("invalid agent configuration")

	// ErrInvalidMaxIterations is returned when MaxIters is negative.
	ErrInvalidMaxIterations = errors.New("MaxIters must be >=0")

	// ErrNilLLMMessage is returned when an LLM provider returns a nil *llm.Message with a nil error.
	ErrNilLLMMessage = errors.New("LLM provider returned nil message")

	// ErrUnknownTool is returned when the model calls an unknown tool.
	ErrUnknownTool = errors.New("unknown tool")
)

// AgentError is a structured error for the ReAct agent loop.
type AgentError struct {
	Phase     string // "validate", "stream_chat", "tool_exec", "delta_callback", "context", "loop"
	Iteration int    // 0-indexed or 1-indexed turn iteration
	ToolName  string // Name of tool being invoked
	Msg       string // Optional message
	Err       error  // Underlying cause or sentinel error
}

func (e *AgentError) Error() string {
	meta := ""
	if e.Phase != "" {
		meta = " [" + e.Phase
		if e.Iteration > 0 {
			meta += fmt.Sprintf(" iter %d", e.Iteration)
		}
		if e.ToolName != "" {
			meta += fmt.Sprintf(" tool %q", e.ToolName)
		}
		meta += "]"
	}
	base := "agent" + meta
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

func (e *AgentError) Unwrap() error {
	return e.Err
}

func (e *AgentError) Is(target error) bool {
	if target == nil {
		return false
	}
	return errors.Is(e.Err, target) // ponytail ultra: one-liner beats 15-line switch
}
