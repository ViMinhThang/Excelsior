package llm

import "context"

// ToolLoopProvider is the application-facing LLM port. Providers own the
// complete multi-step tool loop; the GoAI-backed Client is the standard implementation.
type ToolLoopProvider interface {
	ModelName() string
	StreamChatWithTools(
		ctx context.Context,
		req ChatRequest,
		maxSteps int,
		execute func(context.Context, ToolCall) (string, error),
		onDelta func(Delta) error,
		onToolStart func(ToolCall),
		onToolResult func(ToolCall, string, error),
	) (*Message, []Message, error)
}

var _ ToolLoopProvider = (*Client)(nil)
