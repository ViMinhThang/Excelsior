package llm

import "context"

// Provider defines the interface implemented by LLM backend clients.
// It supports streaming chat completions with real-time delta delivery.
type Provider interface {
	// StreamChat executes a single streaming completion turn.
	StreamChat(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error)

	// ModelName returns the configured model identifier.
	ModelName() string
}

// ToolLoopProvider is optionally implemented by providers that own the
// multi-step tool loop. The standard Client delegates this to GoAI.
type ToolLoopProvider interface {
	Provider
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

// Compile-time check verifying *Client implements Provider.
var _ Provider = (*Client)(nil)
