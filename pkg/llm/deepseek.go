package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client is a DeepSeek-native provider. DeepSeek is OpenAI-compatible but has
// first-class fields like reasoning_content. We hit https://api.deepseek.com directly
// without an OpenAI SDK abstraction so those fields are preserved.
type Client struct {
	APIKey     string
	BaseURL    string // default https://api.deepseek.com
	Model      string // e.g. deepseek-chat, deepseek-reasoner
	HTTPClient *http.Client
}

func (c *Client) baseURL() string {
	if c.BaseURL != "" {
		return strings.TrimRight(c.BaseURL, "/")
	}
	return "https://api.deepseek.com"
}

func (c *Client) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return &http.Client{Timeout: 120 * time.Second}
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
	Type     string       `json:"type"` // "function"
	Function FuncDef      `json:"function"`
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
func (c *Client) StreamChat(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error) {
	req.Stream = true
	if req.Model == "" {
		req.Model = c.Model
	}
	if req.Model == "" {
		req.Model = "deepseek-chat"
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL()+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := c.httpClient().Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("deepseek: %d %s", resp.StatusCode, string(b))
	}

	// Accumulate final message
	var finalContent strings.Builder
	var finalReasoning strings.Builder
	toolCallBuilders := map[int]*ToolCall{}
	var finishReason string
	var usage *Usage

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil && err != io.EOF {
			return nil, err
		}
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			if err == io.EOF {
				break
			}
			continue
		}
		if !strings.HasPrefix(trimmed, "data:") {
			if err == io.EOF {
				break
			}
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
		if data == "[DONE]" {
			if err := onDelta(Delta{Done: true, FinishReason: finishReason, Usage: usage}); err != nil {
				return nil, err
			}
			break
		}

		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			// skip malformed chunk
			if err == io.EOF {
				break
			}
			continue
		}
		if len(chunk.Choices) == 0 {
			if chunk.Usage != nil {
				usage = chunk.Usage
			}
			if err == io.EOF {
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
		// tool call deltas
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
			if err := onDelta(d); err != nil {
				return nil, err
			}
		}

		if ch.FinishReason != "" {
			// wait for [DONE]
		}
		if err == io.EOF {
			break
		}
	}

	// Build final assistant message
	msg := &Message{
		Role:             "assistant",
		Content:          finalContent.String(),
		ReasoningContent: finalReasoning.String(),
	}
	// flush tool calls in index order
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

// NonStreaming helper for tests / simple calls.
func (c *Client) Chat(ctx context.Context, req ChatRequest) (*Message, error) {
	var final *Message
	_, err := c.StreamChat(ctx, req, func(d Delta) error { return nil })
	if err != nil {
		return nil, err
	}
	// Re-run without callback to get final? StreamChat already returns final
	// But we discarded it above; actually capture it properly:
	// So redo with capture:
	final, err = c.StreamChat(ctx, req, func(Delta) error { return nil })
	return final, err
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
