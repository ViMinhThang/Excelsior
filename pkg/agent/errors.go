package agent

import (
	"errors"
	"fmt"
	"strings"
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
	var b strings.Builder
	b.WriteString("agent")
	if e.Phase != "" {
		b.WriteString(" [")
		b.WriteString(e.Phase)
		if e.Iteration > 0 {
			fmt.Fprintf(&b, " iter %d", e.Iteration)
		}
		if e.ToolName != "" {
			fmt.Fprintf(&b, " tool %q", e.ToolName)
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

func (e *AgentError) Unwrap() error {
	return e.Err
}

func (e *AgentError) Is(target error) bool {
	if target == nil {
		return false
	}
	if errors.Is(e.Err, target) {
		return true
	}
	switch target {
	case ErrMaxIterationsReached:
		return errors.Is(e.Err, ErrMaxIterationsReached)
	case ErrContextTooLarge:
		return errors.Is(e.Err, ErrContextTooLarge)
	case ErrEmptyMessages:
		return errors.Is(e.Err, ErrEmptyMessages)
	case ErrLLMNotConfigured:
		return errors.Is(e.Err, ErrLLMNotConfigured)
	case ErrInvalidConfig, ErrInvalidMaxIterations:
		return errors.Is(e.Err, ErrInvalidConfig) || errors.Is(e.Err, ErrInvalidMaxIterations)
	case ErrNilLLMMessage:
		return errors.Is(e.Err, ErrNilLLMMessage)
	case ErrUnknownTool:
		return errors.Is(e.Err, ErrUnknownTool)
	default:
		return false
	}
}
