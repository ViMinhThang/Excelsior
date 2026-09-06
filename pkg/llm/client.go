package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/zendev-sh/goai"
	"github.com/zendev-sh/goai/provider"
	"github.com/zendev-sh/goai/provider/deepseek"
)

// Client adapts GoAI's DeepSeek provider to the application-facing tool-loop port.
// GoAI owns HTTP, SSE parsing, retries, and provider-specific message handling.
type Client struct {
	APIKey     string
	BaseURL    string // Defaults to https://api.deepseek.com when empty.
	Model      string
	HTTPClient *http.Client
	Logger     *slog.Logger
}

// ModelName returns the configured model name.
func (c *Client) ModelName() string { return c.Model }

func (c *Client) model(reqModel string) provider.LanguageModel {
	// Use the model from the request (trimmed of whitespace).
	model := ResolveModel(reqModel)
	// Collect provider options; at most 3 follow.
	opts := make([]deepseek.Option, 0, 3)
	// Attach the API key when one is configured.
	if key := strings.TrimSpace(c.APIKey); key != "" {
		opts = append(opts, deepseek.WithAPIKey(key))
	}
	// Override the API endpoint when a custom base URL is configured.
	if baseURL := strings.TrimSpace(c.BaseURL); baseURL != "" {
		opts = append(opts, deepseek.WithBaseURL(baseURL))
	}
	// Use the injected HTTP client (tests, proxy/timeout); otherwise keep the provider default.
	if c.HTTPClient != nil {
		opts = append(opts, deepseek.WithHTTPClient(c.HTTPClient))
	}
	// Build the chat model with the resolved name and options.
	return deepseek.Chat(model, opts...)
}

// StreamChatWithTools delegates the complete tool loop to GoAI.
// Use case: the agentic run (Agent.runNativeToolLoop). GoAI executes tools via
// execute up to maxSteps, reporting per-tool onToolStart/onToolResult events.
func (c *Client) StreamChatWithTools(
	ctx context.Context,
	req ChatRequest,
	maxSteps int,
	execute func(context.Context, ToolCall) (string, error),
	onDelta func(Delta) error,
	onToolStart func(ToolCall),
	onToolResult func(ToolCall, string, error),
) (*Message, []Message, error) {
	// Convert app messages to provider messages.
	messages, err := toProviderMessages(req.Messages)
	// Bail on unsupported roles.
	if err != nil {
		return nil, nil, err
	}
	// Guard against zero/negative step budgets.
	if maxSteps < 1 {
		maxSteps = 1
	}

	// Preallocate converted GoAI tools.
	goaiTools := make([]goai.Tool, 0, len(req.Tools))
	// Convert each app tool definition to a GoAI tool.
	for _, definition := range req.Tools {
		// Serialize the JSON schema for the model.
		schema, err := json.Marshal(definition.Function.Parameters)
		// Abort on an unmarshallable schema.
		if err != nil {
			return nil, nil, fmt.Errorf("llm: marshal tool schema %q: %w", definition.Function.Name, err)
		}
		// Copy the name for the closure below.
		name := definition.Function.Name
		// Register the tool, routing execution back through execute.
		goaiTools = append(goaiTools, goai.Tool{
			Name:        name,
			Description: definition.Function.Description,
			InputSchema: schema,
			// Bridge GoAI invocations back to the caller's execute.
			Execute: func(toolCtx context.Context, input json.RawMessage) (string, error) {
				return execute(toolCtx, ToolCall{ID: goai.ToolCallIDFromContext(toolCtx), Type: "function", Function: FuncCall{Name: name, Arguments: string(input)}})
			},
		})
	}

	// Base GoAI options: history, tools, step budget, ordered execution.
	options := []goai.Option{
		goai.WithMessages(messages...),
		goai.WithTools(goaiTools...),
		goai.WithMaxSteps(maxSteps),
		goai.WithSequentialToolExecution(),
	}
	// Override temperature only when set.
	if req.Temperature != nil {
		options = append(options, goai.WithTemperature(*req.Temperature))
	}
	// Override max output tokens only when set.
	if req.MaxTokens != nil {
		options = append(options, goai.WithMaxOutputTokens(*req.MaxTokens))
	}
	// Override top-p only when set.
	if req.TopP != nil {
		options = append(options, goai.WithTopP(*req.TopP))
	}
	// Forward tool-start events when observed.
	if onToolStart != nil {
		options = append(options, goai.WithOnToolCallStart(func(info goai.ToolCallStartInfo) {
			onToolStart(ToolCall{ID: info.ToolCallID, Type: "function", Function: FuncCall{Name: info.ToolName, Arguments: string(info.Input)}})
		}))
	}
	// Forward tool-result events when observed.
	if onToolResult != nil {
		options = append(options, goai.WithOnToolCall(func(info goai.ToolCallInfo) {
			onToolResult(ToolCall{ID: info.ToolCallID, Type: "function", Function: FuncCall{Name: info.ToolName, Arguments: string(info.Input)}}, info.Output, info.Error)
		}))
	}

	// Start the streaming run.
	stream, err := goai.StreamText(ctx, c.model(req.Model), options...)
	// Wrap startup failures.
	if err != nil {
		return nil, nil, newGoAIError(req.Model, err)
	}
	// Forward each chunk to the caller.
	for chunk := range stream.Stream() {
		if err := forwardChunk(chunk, onDelta); err != nil {
			return nil, nil, err
		}
	}
	// Surface mid-stream failures.
	if err := stream.Err(); err != nil {
		return nil, nil, newGoAIError(req.Model, err)
	}

	// Collect the final result.
	result := stream.Result()
	// Build the final assistant message.
	message := &Message{Role: "assistant", Content: result.Text, ReasoningContent: result.Reasoning, ToolCalls: fromGoAIToolCalls(result.ToolCalls)}
	// Return it plus the full message history.
	return message, fromProviderMessages(result.ResponseMessages), nil
}

func forwardChunk(chunk provider.StreamChunk, onDelta func(Delta) error) error {
	if onDelta == nil {
		return nil
	}
	var delta Delta
	switch chunk.Type {
	case provider.ChunkText:
		delta.Content = chunk.Text
	case provider.ChunkReasoning:
		delta.ReasoningContent = chunk.Text
	case provider.ChunkToolCall:
		delta.ToolCalls = []ToolCallDelta{{
			ID:   chunk.ToolCallID,
			Type: "function",
			Function: struct {
				Name      string
				Arguments string
			}{Name: chunk.ToolName, Arguments: chunk.ToolInput},
		}}
	case provider.ChunkError:
		if chunk.Error != nil {
			return chunk.Error
		}
		return nil
	default:
		return nil
	}
	if delta.Content == "" && delta.ReasoningContent == "" && len(delta.ToolCalls) == 0 {
		return nil
	}
	return onDelta(delta)
}

// toProviderMessages converts app messages to provider messages.
// Example input:
//
//	[]Message{
//		{Role: "user", Content: "hi"},
//		{Role: "assistant", Content: "hello", ToolCalls: []ToolCall{{ID: "1", Type: "function", Function: FuncCall{Name: "get_time", Arguments: "{}"}}}},
//		{Role: "tool", ToolCallID: "1", Name: "get_time", Content: "noon"},
//	}
//
// Example output (same order, one provider.Message each):
//
//	[]provider.Message{
//		{Role: provider.RoleUser, Content: []provider.Part{{Type: provider.PartText, Text: "hi"}}},
//		{Role: provider.RoleAssistant, Content: []provider.Part{
//			{Type: provider.PartText, Text: "hello"},
//			{Type: provider.PartToolCall, ToolCallID: "1", ToolName: "get_time", ToolInput: json.RawMessage("{}")},
//		}},
//		{Role: provider.RoleTool, Content: []provider.Part{
//			{Type: provider.PartToolResult, ToolCallID: "1", ToolName: "get_time", ToolOutput: "noon"},
//		}},
//	}
func toProviderMessages(messages []Message) ([]provider.Message, error) {
	// Preallocate the converted output.
	out := make([]provider.Message, 0, len(messages))
	for _, message := range messages {
		// Map the role string to a provider role.
		role, err := toProviderRole(message.Role)
		// Bail on unsupported roles.
		if err != nil {
			return nil, err
		}
		// Preallocate content parts (text + reasoning + tool calls).
		parts := make([]provider.Part, 0, 2+len(message.ToolCalls))
		// Keep non-empty text as a text part.
		if message.Content != "" {
			parts = append(parts, provider.Part{Type: provider.PartText, Text: message.Content})
		}
		// Keep non-empty reasoning as a reasoning part.
		if message.ReasoningContent != "" {
			parts = append(parts, provider.Part{Type: provider.PartReasoning, Text: message.ReasoningContent})
		}
		// Append each requested tool call as a tool-call part.
		for _, call := range message.ToolCalls {
			parts = append(parts, provider.Part{Type: provider.PartToolCall, ToolCallID: call.ID, ToolName: call.Function.Name, ToolInput: json.RawMessage(call.Function.Arguments)})
		}
		// Tool messages carry only the tool result, replacing prior parts.
		if message.Role == "tool" {
			parts = []provider.Part{{Type: provider.PartToolResult, ToolCallID: message.ToolCallID, ToolName: message.Name, ToolOutput: message.Content}}
		}
		// Append the converted message.
		out = append(out, provider.Message{Role: role, Content: parts})
	}
	// Return the full converted history.
	return out, nil
}

func toProviderRole(role string) (provider.Role, error) {
	switch role {
	case "system":
		return provider.RoleSystem, nil
	case "user":
		return provider.RoleUser, nil
	case "assistant":
		return provider.RoleAssistant, nil
	case "tool":
		return provider.RoleTool, nil
	default:
		return "", fmt.Errorf("llm: unsupported message role %q", role)
	}
}

func fromProviderMessages(messages []provider.Message) []Message {
	out := make([]Message, 0, len(messages))
	for _, message := range messages {
		converted := Message{Role: string(message.Role)}
		for _, part := range message.Content {
			switch part.Type {
			case provider.PartText:
				converted.Content += part.Text
			case provider.PartReasoning:
				converted.ReasoningContent += part.Text
			case provider.PartToolCall:
				converted.ToolCalls = append(converted.ToolCalls, ToolCall{ID: part.ToolCallID, Type: "function", Function: FuncCall{Name: part.ToolName, Arguments: string(part.ToolInput)}})
			case provider.PartToolResult:
				converted.ToolCallID = part.ToolCallID
				converted.Name = part.ToolName
				converted.Content += part.ToolOutput
			}
		}
		out = append(out, converted)
	}
	return out
}

func fromGoAIToolCalls(calls []provider.ToolCall) []ToolCall {
	out := make([]ToolCall, 0, len(calls))
	for _, call := range calls {
		out = append(out, ToolCall{ID: call.ID, Type: "function", Function: FuncCall{Name: call.Name, Arguments: string(call.Input)}})
	}
	return out
}

func newGoAIError(model string, err error) error {
	var apiErr *goai.APIError
	if errors.As(err, &apiErr) {
		return &LLMError{StatusCode: apiErr.StatusCode, Model: model, Body: apiErr.ResponseBody, Err: fmt.Errorf("%w: %v", classifyStatus(apiErr.StatusCode), err)}
	}
	var overflow *goai.ContextOverflowError
	if errors.As(err, &overflow) {
		return &LLMError{Model: model, Body: overflow.ResponseBody, Err: fmt.Errorf("%w: %v", ErrInvalidRequest, err)}
	}
	if errors.Is(err, context.Canceled) {
		return err
	}
	return &LLMError{Model: model, Err: fmt.Errorf("%w: %v", ErrStreamInterrupted, err)}
}

// ponytail: status already implies the class; Kind field was a third copy of the same fact
func classifyStatus(status int) error {
	switch {
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return ErrAuthFailed
	case status == http.StatusTooManyRequests:
		return ErrRateLimit
	case status == http.StatusBadRequest:
		return ErrInvalidRequest
	case status >= http.StatusInternalServerError:
		return ErrServerUnavailable
	default:
		return ErrStreamInterrupted
	}
}

// IsRetryable reports whether GoAI classified an error as transient.
func IsRetryable(err error) bool {
	var apiErr *goai.APIError
	if errors.As(err, &apiErr) {
		return apiErr.IsRetryable
	}
	var llmErr *LLMError
	return errors.As(err, &llmErr) && llmErr.IsRetryable()
}
