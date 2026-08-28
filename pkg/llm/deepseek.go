package llm

// deepseek.go has been modularized into:
// - types.go: Data types, Message, Delta, ChatRequest, streamChunk
// - retry.go: RetryPolicy, exponential backoff, LLMError, isRetryable
// - sse.go: SSE stream parser, chunk JSON deserialization
// - client.go: Client struct, StreamChat, HTTP transport
