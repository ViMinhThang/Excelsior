package llm

import "context"

// Provider defines the interface implemented by LLM backend clients.
// It supports streaming chat completions with real-time delta delivery.
type Provider interface {
	// StreamChat executes a streaming completion turn and returns the aggregated Message.
	StreamChat(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error)

	// ModelName returns the configured model identifier.
	ModelName() string
}

// Compile-time check verifying *Client implements Provider.
var _ Provider = (*Client)(nil)
