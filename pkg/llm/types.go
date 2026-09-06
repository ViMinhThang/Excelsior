package llm

import (
	"excelsior/pkg/config"
)

// ResolveModel trims whitespace and returns the model ID (no alias mapping).
func ResolveModel(m string) string {
	return config.ResolveModel(m)
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

// ToolCall is a model-requested function invocation in an assistant message.
type ToolCall struct {
	ID       string   `json:"id"`
	Type     string   `json:"type"` // "function"
	Function FuncCall `json:"function"`
}

// FuncCall holds the function name and JSON-encoded arguments.
type FuncCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON string
}

// ToolDefinition describes a callable tool for the model (OpenAI function calling).
type ToolDefinition struct {
	Type     string  `json:"type"` // "function"
	Function FuncDef `json:"function"`
}

// FuncDef is the function metadata inside a [ToolDefinition].
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

// ToolCallDelta is an incremental tool-call fragment within a [Delta].
type ToolCallDelta struct {
	Index    int
	ID       string
	Type     string
	Function struct {
		Name      string
		Arguments string
	}
}

// Usage reports token counts when provided by the API.
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}
