package protocol

import "excelsior/pkg/llm"

const Ver = "v1"

// Envelope is the WS frame.
type Envelope struct {
	Ver     string      `json:"ver"`
	ID      string      `json:"id,omitempty"`
	Type    string      `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
}

// Types
const (
	TypeChatReq    = "chat.req"
	TypeDelta      = "delta"
	TypeDone       = "done"
	TypeError      = "error"
	TypeAskReq     = "ask.req"
	TypeAskResp    = "ask.resp"
	TypePing       = "ping"
	TypePong       = "pong"
	TypeSessionPush = "session.push"
	TypeSessionPull = "session.pull"
	TypeSessionData = "session.data"
)

// ChatReq is client → engine to start a turn.
type ChatReq struct {
	Model    string        `json:"model"`
	Messages []llm.Message `json:"messages"`
}

// Delta is engine → client streaming fragment (maps to agent.StreamEvent).
type Delta struct {
	Type         string `json:"type"` // text|reasoning|tool_start|tool_result|done|error
	Text         string `json:"text,omitempty"`
	Reasoning    string `json:"reasoning,omitempty"`
	ToolName     string `json:"toolName,omitempty"`
	ToolCallID   string `json:"toolCallID,omitempty"`
	ToolArgs     string `json:"toolArgs,omitempty"`
	ToolResult   string `json:"toolResult,omitempty"`
	FinishReason string `json:"finishReason,omitempty"`
}

// AskReq is engine → client when agent calls askQuestion.
type AskReq struct {
	Question string   `json:"question"`
	Options  []string `json:"options"` // 3
}

// AskResp is client → engine with user choice.
type AskResp struct {
	Selected int    `json:"selected"` // 0..2 or -1 for manual
	Answer   string `json:"answer"`
	Label    string `json:"label"`
}

// SessionPush/Pull for sync.
type SessionPush struct {
	ID       string        `json:"id"`
	Messages []llm.Message `json:"messages"`
}
type SessionPull struct {
	ID string `json:"id"`
}
type SessionData struct {
	ID       string        `json:"id"`
	Messages []llm.Message `json:"messages"`
}
