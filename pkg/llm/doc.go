// Package llm provides a DeepSeek-native OpenAI-compatible client with
// first-class reasoning_content, SSE streaming, retries and typed errors.
// It has no dependency on higher-level packages; agent depends on llm.Port.
//
//   client := &llm.Client{APIKey: os.Getenv("DEEPSEEK_API_KEY"), Model: "deepseek-v4-flash"}
//   msg, err := client.StreamChat(ctx, req, func(d llm.Delta) error { ... })
package llm
