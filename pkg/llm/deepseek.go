package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"strings"
	"time"

	"excelsior/pkg/config"
)

// Client is a DeepSeek-native provider. DeepSeek is OpenAI-compatible but has
// first-class fields like reasoning_content. We hit https://api.deepseek.com directly
// without an OpenAI SDK abstraction so those fields are preserved.
type Client struct {
	APIKey     string
	BaseURL    string // default https://api.deepseek.com
	Model      string // e.g. deepseek-v4-flash, deepseek-reasoner
	HTTPClient *http.Client
	Logger     *slog.Logger
}

func (c *Client) baseURL() string {
	if c.BaseURL != "" {
		return strings.TrimRight(c.BaseURL, "/")
	}
	return "https://api.deepseek.com"
}

func resolveModel(m string) string { return config.ResolveModel(m) }

// IsReasoner reports whether a model uses reasoning_content.
func IsReasoner(model string) bool {
	m := resolveModel(model)
	return m == "deepseek-reasoner"
}

// RetryPolicy controls retry for transient failures.
type RetryPolicy struct {
	MaxRetries int
	BaseDelay  time.Duration
}

func (p RetryPolicy) shouldRetry(status int, err error, attempt int) (bool, time.Duration) {
	if attempt >= p.MaxRetries {
		return false, 0
	}
	if !isRetryable(status, err) {
		return false, 0
	}
	backoff := time.Duration(math.Pow(2, float64(attempt))*float64(p.BaseDelay)) + time.Duration(rand.Int63n(int64(p.BaseDelay)))
	return true, backoff
}

var defaultRetry = RetryPolicy{MaxRetries: 2, BaseDelay: 200 * time.Millisecond}

func (c *Client) validate() error {
	if strings.TrimSpace(c.APIKey) == "" {
		return errors.New("deepseek: APIKey is empty (set DEEPSEEK_API_KEY)")
	}
	u, err := url.Parse(c.baseURL())
	if err != nil || u.Scheme == "" || u.Host == "" {
		return fmt.Errorf("deepseek: invalid BaseURL %q: %w", c.baseURL(), err)
	}
	return nil
}

func (c *Client) logger() *slog.Logger {
	if c.Logger != nil {
		return c.Logger
	}
	return slog.Default()
}

func (c *Client) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return &http.Client{Timeout: 120 * time.Second}
}

func (c *Client) effectiveModel() string { return resolveModel(c.Model) }

const (
	maxErrorBody = 4 * 1024
	maxSSLine    = 1 << 20 // 1 MiB per SSE line (prevent OOM)
)

// LLMError is a typed error for API failures.
type LLMError struct {
	StatusCode int
	Body       string
	Err        error
}

func (e *LLMError) Error() string {
	if e.Body != "" {
		return fmt.Sprintf("deepseek: %d %s", e.StatusCode, e.Body)
	}
	if e.Err != nil {
		return fmt.Sprintf("deepseek: %d: %v", e.StatusCode, e.Err)
	}
	return fmt.Sprintf("deepseek: %d", e.StatusCode)
}
func (e *LLMError) Unwrap() error { return e.Err }

// isRetryable returns true for transient failures.
func isRetryable(status int, err error) bool {
	if err != nil {
		// network errors, context.Canceled is not retryable, but DeadlineExceeded maybe
		if errors.Is(err, context.Canceled) {
			return false
		}
		return true
	}
	switch status {
	case http.StatusTooManyRequests, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout, http.StatusInternalServerError:
		return true
	default:
		return false
	}
}

// Message is a chat message. ReasoningContent is DeepSeek-specific (R1/reasoner).
type Message struct {
	Role             string     `json:"role"`
	Content          string     `json:"content,omitempty"`
	ReasoningContent string     `json:"reasoning_content,omitempty"`
	ToolCalls        []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID       string     `json:"tool_call_id,omitempty"`
	Name             string     `json:"name,omitempty"`
}

type ToolCall struct {
	ID       string   `json:"id"`
	Type     string   `json:"type"` // "function"
	Function FuncCall `json:"function"`
}

type FuncCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON string
}

type ToolDefinition struct {
	Type     string `json:"type"` // "function"
	Function FuncDef `json:"function"`
}

type FuncDef struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Parameters  any    `json:"parameters"` // JSON Schema
}

// ChatRequest is the wire format for /v1/chat/completions.
type ChatRequest struct {
	Model       string           `json:"model"`
	Messages    []Message        `json:"messages"`
	Tools       []ToolDefinition `json:"tools,omitempty"`
	ToolChoice  any              `json:"tool_choice,omitempty"` // "auto" | "required" | object
	Stream      bool             `json:"stream"`
	Temperature *float64         `json:"temperature,omitempty"`
	MaxTokens   *int             `json:"max_tokens,omitempty"`
	TopP        *float64         `json:"top_p,omitempty"`
}

// Delta is a streaming fragment.
type Delta struct {
	Content          string
	ReasoningContent string
	ToolCalls        []ToolCallDelta
	FinishReason     string
	Done             bool
	Usage            *Usage
}

type ToolCallDelta struct {
	Index    int
	ID       string
	Type     string
	Function struct {
		Name      string
		Arguments string
	}
}

type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// StreamChat calls DeepSeek with stream=true and invokes onDelta for each fragment.
// It handles SSE parsing (data: {...}) and aggregates tool-call deltas.
// Retries transient failures with exponential backoff (up to 3 attempts).
func (c *Client) StreamChat(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error) {
	if err := c.validate(); err != nil {
		return nil, err
	}
	// Default model + alias resolve (v4-pro → reasoner)
	if req.Model == "" {
		req.Model = c.Model
	}
	req.Model = resolveModel(req.Model)
	if req.Model == "" {
		req.Model = "deepseek-v4-flash"
	}
	req.Stream = true

	var lastErr error
	for attempt := 0; attempt <= defaultRetry.MaxRetries; attempt++ {
		msg, err := c.doStreamOnce(ctx, req, onDelta)
		if err == nil {
			return msg, nil
		}
		lastErr = err
		var le *LLMError
		status := 0
		if errors.As(err, &le) {
			status = le.StatusCode
		}
		should, backoff := defaultRetry.shouldRetry(status, err, attempt)
		if !should {
			break
		}
		if ctx.Err() != nil {
			return nil, fmt.Errorf("deepseek stream canceled: %w", ctx.Err())
		}
		c.logger().Warn("deepseek retry", "attempt", attempt+1, "status", status, "backoff", backoff, "err", err)
		select {
		case <-time.After(backoff):
		case <-ctx.Done():
			return nil, fmt.Errorf("deepseek stream canceled during backoff: %w", ctx.Err())
		}
	}
	return nil, lastErr
}

func (c *Client) doStreamOnce(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("deepseek: marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL()+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("deepseek: new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := c.httpClient().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("deepseek: do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, readErr := io.ReadAll(io.LimitReader(resp.Body, maxErrorBody))
		if readErr != nil {
			return nil, &LLMError{StatusCode: resp.StatusCode, Err: readErr}
		}
		trimmed := strings.TrimSpace(string(b))
		if len(trimmed) > 500 {
			trimmed = trimmed[:500] + "…"
		}
		return nil, &LLMError{StatusCode: resp.StatusCode, Body: trimmed}
	}

	var finalContent strings.Builder
	var finalReasoning strings.Builder
	toolCallBuilders := map[int]*ToolCall{}
	var finishReason string
	var usage *Usage

	reader := bufio.NewReader(resp.Body)
	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("deepseek: context canceled: %w", ctx.Err())
		default:
		}
		line, err := reader.ReadString('\n')
		// Guard against OOM: single line too large
		if len(line) > maxSSLine {
			return nil, fmt.Errorf("deepseek: SSE line too large (%d > %d)", len(line), maxSSLine)
		}
		if err != nil && !errors.Is(err, io.EOF) {
			return nil, fmt.Errorf("deepseek: read SSE: %w", err)
		}
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			if errors.Is(err, io.EOF) {
				break
			}
			continue
		}
		if !strings.HasPrefix(trimmed, "data:") {
			if errors.Is(err, io.EOF) {
				break
			}
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
		if data == "[DONE]" {
			if onDelta != nil {
				if err := onDelta(Delta{Done: true, FinishReason: finishReason, Usage: usage}); err != nil {
					return nil, fmt.Errorf("deepseek: onDelta done: %w", err)
				}
			}
			break
		}

		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			c.logger().Warn("deepseek: skip malformed SSE chunk", "data", truncate(data, 500), "err", err)
			if errors.Is(err, io.EOF) {
				break
			}
			continue
		}
		if len(chunk.Choices) == 0 {
			if chunk.Usage != nil {
				usage = chunk.Usage
			}
			if errors.Is(err, io.EOF) {
				break
			}
			continue
		}
		ch := chunk.Choices[0]
		if ch.FinishReason != "" {
			finishReason = ch.FinishReason
		}
		if ch.Usage != nil {
			usage = ch.Usage
		}

		d := Delta{
			Content:          ch.Delta.Content,
			ReasoningContent: ch.Delta.ReasoningContent,
			FinishReason:     ch.FinishReason,
		}
		if ch.Delta.ReasoningContent != "" {
			finalReasoning.WriteString(ch.Delta.ReasoningContent)
		}
		if ch.Delta.Content != "" {
			finalContent.WriteString(ch.Delta.Content)
		}
		for _, tc := range ch.Delta.ToolCalls {
			b := toolCallBuilders[tc.Index]
			if b == nil {
				b = &ToolCall{Type: "function"}
				toolCallBuilders[tc.Index] = b
			}
			if tc.ID != "" {
				b.ID = tc.ID
			}
			if tc.Type != "" {
				b.Type = tc.Type
			}
			if tc.Function.Name != "" {
				b.Function.Name = tc.Function.Name
			}
			if tc.Function.Arguments != "" {
				b.Function.Arguments += tc.Function.Arguments
			}
			d.ToolCalls = append(d.ToolCalls, tc)
		}

		if d.Content != "" || d.ReasoningContent != "" || len(d.ToolCalls) > 0 || d.FinishReason != "" {
			if onDelta != nil {
				if err := onDelta(d); err != nil {
					return nil, fmt.Errorf("deepseek: onDelta: %w", err)
				}
			}
		}
		if errors.Is(err, io.EOF) {
			break
		}
	}

	msg := &Message{
		Role:             "assistant",
		Content:          finalContent.String(),
		ReasoningContent: finalReasoning.String(),
	}
	if len(toolCallBuilders) > 0 {
		maxIdx := -1
		for k := range toolCallBuilders {
			if k > maxIdx {
				maxIdx = k
			}
		}
		for i := 0; i <= maxIdx; i++ {
			if tc, ok := toolCallBuilders[i]; ok {
				if tc.Type == "" {
					tc.Type = "function"
				}
				msg.ToolCalls = append(msg.ToolCalls, *tc)
			}
		}
	}
	return msg, nil
}

// Chat is a non-streaming helper (single request, no onDelta required).
func (c *Client) Chat(ctx context.Context, req ChatRequest) (*Message, error) {
	req.Stream = true
	return c.StreamChat(ctx, req, func(Delta) error { return nil })
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// streamChunk mirrors DeepSeek's SSE chunk shape.
type streamChunk struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index        int    `json:"index"`
		FinishReason string `json:"finish_reason"`
		Delta        struct {
			Role             string          `json:"role,omitempty"`
			Content          string          `json:"content,omitempty"`
			ReasoningContent string          `json:"reasoning_content,omitempty"`
			ToolCalls        []ToolCallDelta `json:"tool_calls,omitempty"`
		} `json:"delta"`
		Usage *Usage `json:"usage,omitempty"`
	} `json:"choices"`
	Usage *Usage `json:"usage,omitempty"`
}
