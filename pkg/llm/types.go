package llm

import "excelsior/pkg/config"

func resolveModel(m string) string { return config.ResolveModel(m) }

// IsReasoner reports whether a model uses reasoning_content.
func IsReasoner(model string) bool {
	m := resolveModel(model)
	return m == "deepseek-reasoner"
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
	Type     string  `json:"type"` // "function"
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
