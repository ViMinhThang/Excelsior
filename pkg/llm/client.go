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

// Client adapts GoAI's DeepSeek provider to this package's Provider interface.
// GoAI owns HTTP, SSE parsing, retries, and provider-specific message handling.
type Client struct {
	APIKey     string
	BaseURL    string // Defaults to https://api.deepseek.com when empty.
	Model      string
	HTTPClient *http.Client
	Logger     *slog.Logger
}

// NewClient returns a new Client with the given API key and model.
func NewClient(apiKey, model string) *Client {
	return &Client{APIKey: apiKey, Model: model}
}

// ModelName returns the configured model name.
func (c *Client) ModelName() string { return c.Model }

func (c *Client) model(reqModel string) provider.LanguageModel {
	model := ResolveModel(reqModel)
	if model == "" {
		model = ResolveModel(c.Model)
	}
	if model == "" {
		model = "deepseek-chat"
	}

	opts := make([]deepseek.Option, 0, 3)
	if key := strings.TrimSpace(c.APIKey); key != "" {
		opts = append(opts, deepseek.WithAPIKey(key))
	}
	if baseURL := strings.TrimSpace(c.BaseURL); baseURL != "" {
		opts = append(opts, deepseek.WithBaseURL(baseURL))
	}
	if c.HTTPClient != nil {
		opts = append(opts, deepseek.WithHTTPClient(c.HTTPClient))
	}
	return deepseek.Chat(model, opts...)
}

// StreamChat runs one provider generation step through GoAI. The Agent retains
// ownership of the tool-call loop so its tool and permission events continue to
// have the same behavior across CLI, TUI, and WebSocket clients.
func (c *Client) StreamChat(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error) {
	messages, err := toProviderMessages(req.Messages)
	if err != nil {
		return nil, err
	}

	opts := []goai.Option{
		goai.WithMessages(messages...),
		goai.WithTools(toGoAITools(req.Tools)...),
		goai.WithMaxSteps(1),
	}
	if req.Temperature != nil {
		opts = append(opts, goai.WithTemperature(*req.Temperature))
	}
	if req.MaxTokens != nil {
		opts = append(opts, goai.WithMaxOutputTokens(*req.MaxTokens))
	}
	if req.TopP != nil {
		opts = append(opts, goai.WithTopP(*req.TopP))
	}

	stream, err := goai.StreamText(ctx, c.model(req.Model), opts...)
	if err != nil {
		return nil, newGoAIError(req.Model, err)
	}
	for chunk := range stream.Stream() {
		if err := forwardChunk(chunk, onDelta); err != nil {
			return nil, err
		}
	}
	if err := stream.Err(); err != nil {
		return nil, newGoAIError(req.Model, err)
	}

	result := stream.Result()
	message := &Message{
		Role:             "assistant",
		Content:          result.Text,
		ReasoningContent: result.Reasoning,
		ToolCalls:        fromGoAIToolCalls(result.ToolCalls),
	}
	if result.Reasoning != "" && strings.HasPrefix(message.Content, result.Reasoning) {
		message.Content = strings.TrimPrefix(message.Content, result.Reasoning)
	}
	if onDelta != nil {
		if err := onDelta(Delta{Done: true, FinishReason: string(result.FinishReason), Usage: usageFromGoAI(result.TotalUsage)}); err != nil {
			return nil, err
		}
	}
	return message, nil
}

// StreamChatWithTools delegates the complete tool loop to GoAI.
func (c *Client) StreamChatWithTools(
	ctx context.Context,
	req ChatRequest,
	maxSteps int,
	execute func(context.Context, ToolCall) (string, error),
	onDelta func(Delta) error,
	onToolStart func(ToolCall),
	onToolResult func(ToolCall, string, error),
) (*Message, []Message, error) {
	messages, err := toProviderMessages(req.Messages)
	if err != nil {
		return nil, nil, err
	}
	if maxSteps < 1 {
		maxSteps = 1
	}

	goaiTools := make([]goai.Tool, 0, len(req.Tools))
	for _, definition := range req.Tools {
		schema, err := json.Marshal(definition.Function.Parameters)
		if err != nil {
			return nil, nil, fmt.Errorf("llm: marshal tool schema %q: %w", definition.Function.Name, err)
		}
		name := definition.Function.Name
		goaiTools = append(goaiTools, goai.Tool{
			Name:        name,
			Description: definition.Function.Description,
			InputSchema: schema,
			Execute: func(toolCtx context.Context, input json.RawMessage) (string, error) {
				return execute(toolCtx, ToolCall{ID: goai.ToolCallIDFromContext(toolCtx), Type: "function", Function: FuncCall{Name: name, Arguments: string(input)}})
			},
		})
	}

	options := []goai.Option{
		goai.WithMessages(messages...),
		goai.WithTools(goaiTools...),
		goai.WithMaxSteps(maxSteps),
		goai.WithSequentialToolExecution(),
	}
	if req.Temperature != nil {
		options = append(options, goai.WithTemperature(*req.Temperature))
	}
	if req.MaxTokens != nil {
		options = append(options, goai.WithMaxOutputTokens(*req.MaxTokens))
	}
	if req.TopP != nil {
		options = append(options, goai.WithTopP(*req.TopP))
	}
	if onToolStart != nil {
		options = append(options, goai.WithOnToolCallStart(func(info goai.ToolCallStartInfo) {
			onToolStart(ToolCall{ID: info.ToolCallID, Type: "function", Function: FuncCall{Name: info.ToolName, Arguments: string(info.Input)}})
		}))
	}
	if onToolResult != nil {
		options = append(options, goai.WithOnToolCall(func(info goai.ToolCallInfo) {
			onToolResult(ToolCall{ID: info.ToolCallID, Type: "function", Function: FuncCall{Name: info.ToolName, Arguments: string(info.Input)}}, info.Output, info.Error)
		}))
	}

	stream, err := goai.StreamText(ctx, c.model(req.Model), options...)
	if err != nil {
		return nil, nil, newGoAIError(req.Model, err)
	}
	for chunk := range stream.Stream() {
		if err := forwardChunk(chunk, onDelta); err != nil {
			return nil, nil, err
		}
	}
	if err := stream.Err(); err != nil {
		return nil, nil, newGoAIError(req.Model, err)
	}

	result := stream.Result()
	message := &Message{Role: "assistant", Content: result.Text, ReasoningContent: result.Reasoning, ToolCalls: fromGoAIToolCalls(result.ToolCalls)}
	return message, fromProviderMessages(result.ResponseMessages), nil
}

// Chat is a non-streaming helper that consumes StreamChat without deltas.
func (c *Client) Chat(ctx context.Context, req ChatRequest) (*Message, error) {
	return c.StreamChat(ctx, req, nil)
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

func toProviderMessages(messages []Message) ([]provider.Message, error) {
	out := make([]provider.Message, 0, len(messages))
	for _, message := range messages {
		role, err := toProviderRole(message.Role)
		if err != nil {
			return nil, err
		}
		parts := make([]provider.Part, 0, 2+len(message.ToolCalls))
		if message.Content != "" {
			parts = append(parts, provider.Part{Type: provider.PartText, Text: message.Content})
		}
		if message.ReasoningContent != "" {
			parts = append(parts, provider.Part{Type: provider.PartReasoning, Text: message.ReasoningContent})
		}
		for _, call := range message.ToolCalls {
			parts = append(parts, provider.Part{Type: provider.PartToolCall, ToolCallID: call.ID, ToolName: call.Function.Name, ToolInput: json.RawMessage(call.Function.Arguments)})
		}
		if message.Role == "tool" {
			parts = []provider.Part{{Type: provider.PartToolResult, ToolCallID: message.ToolCallID, ToolName: message.Name, ToolOutput: message.Content}}
		}
		out = append(out, provider.Message{Role: role, Content: parts})
	}
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

func toGoAITools(definitions []ToolDefinition) []goai.Tool {
	tools := make([]goai.Tool, 0, len(definitions))
	for _, definition := range definitions {
		schema, err := json.Marshal(definition.Function.Parameters)
		if err != nil {
			continue
		}
		tools = append(tools, goai.Tool{Name: definition.Function.Name, Description: definition.Function.Description, InputSchema: schema})
	}
	return tools
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

func usageFromGoAI(usage provider.Usage) *Usage {
	return &Usage{PromptTokens: usage.InputTokens, CompletionTokens: usage.OutputTokens, TotalTokens: usage.TotalTokens}
}

func newGoAIError(model string, err error) error {
	var apiErr *goai.APIError
	if errors.As(err, &apiErr) {
		kind, sentinel := classifyStatus(apiErr.StatusCode)
		return &LLMError{StatusCode: apiErr.StatusCode, Kind: kind, Model: model, Body: apiErr.ResponseBody, Err: fmt.Errorf("%w: %v", sentinel, err)}
	}
	var overflow *goai.ContextOverflowError
	if errors.As(err, &overflow) {
		return &LLMError{Kind: ErrorKindValidation, Model: model, Body: overflow.ResponseBody, Err: fmt.Errorf("%w: %v", ErrInvalidRequest, err)}
	}
	if errors.Is(err, context.Canceled) {
		return err
	}
	return &LLMError{Kind: ErrorKindStream, Model: model, Err: fmt.Errorf("%w: %v", ErrStreamInterrupted, err)}
}

func classifyStatus(status int) (ErrorKind, error) {
	switch {
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return ErrorKindAuth, ErrAuthFailed
	case status == http.StatusTooManyRequests:
		return ErrorKindRateLimit, ErrRateLimit
	case status == http.StatusBadRequest:
		return ErrorKindValidation, ErrInvalidRequest
	case status >= http.StatusInternalServerError:
		return ErrorKindServer, ErrServerUnavailable
	default:
		return ErrorKindUnknown, ErrStreamInterrupted
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
