// Package llm provides a DeepSeek-native HTTP client with first-class
// reasoning_content, SSE streaming, retries, and typed errors.
// It is OpenAI-compatible on the wire but preserves DeepSeek-specific fields
// (e.g. reasoning_content) without an OpenAI SDK abstraction.
//
// The package has no dependency on higher-level packages; [agent.Agent]
// depends on it via a small interface.
//
// Example:
//
//	client := &llm.Client{APIKey: os.Getenv("DEEPSEEK_API_KEY"), Model: "deepseek-v4-flash"}
//	msg, err := client.StreamChat(ctx, req, func(d llm.Delta) error {
//	    fmt.Print(d.Content)
//	    return nil
//	})
//
// Retries are automatic for 429/5xx with exponential backoff; errors are
// returned as *[LLMError] with StatusCode for caller inspection.
package llm
