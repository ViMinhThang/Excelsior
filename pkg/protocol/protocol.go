package protocol

import (
	"encoding/json"

	"excelsior/pkg/llm"
)

const Ver = "v1"

// Envelope is the WS frame.
type Envelope struct {
	Ver     string          `json:"ver"`
	ID      string          `json:"id,omitempty"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Decode unmarshals Payload into v. Returns nil if payload is empty.
func (e Envelope) Decode(v any) error {
	if len(e.Payload) == 0 {
		return nil
	}
	return json.Unmarshal(e.Payload, v)
}

// MustMarshalPayload marshals v to json.RawMessage. Panics on error (caller bug).
func MustMarshalPayload(v any) json.RawMessage {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

// NewEnvelope creates a versioned envelope with JSON payload.
func NewEnvelope(typ string, payload any) Envelope {
	return Envelope{Ver: Ver, Type: typ, Payload: MustMarshalPayload(payload)}
}

// NewEnvelopeWithID creates a versioned envelope with ID and payload.
func NewEnvelopeWithID(id, typ string, payload any) Envelope {
	return Envelope{Ver: Ver, ID: id, Type: typ, Payload: MustMarshalPayload(payload)}
}

// Types
const (
	TypeChatReq       = "chat.req"
	TypeDelta         = "delta"
	TypeDone          = "done"
	TypeError         = "error"
	TypeAskReq        = "ask.req"
	TypeAskResp       = "ask.resp"
	TypePing          = "ping"
	TypePong          = "pong"
	TypeSessionList   = "session.list"
	TypeSessionData   = "session.data"
	TypeSessionCreate = "session.create"
	TypeSessionDelete = "session.delete"
	TypeSessionRename = "session.rename"
	TypeWorkspaceSet  = "workspace.set"
)

// WorkspaceSetReq sets active workspace path in engine
type WorkspaceSetReq struct {
	Workspace string `json:"workspace"`
}

// ChatReq is client → engine to start a turn. SessionID ties it to a session sidebar entry.
type ChatReq struct {
	SessionID string        `json:"sessionId,omitempty"`
	Model     string        `json:"model"`
	Messages  []llm.Message `json:"messages"`
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

// Session management (unified for TUI/web/desktop)
type SessionListReq struct{}
type SessionListResp struct {
	Sessions []SessionInfo `json:"sessions"`
}
type SessionInfo struct {
	ID        string `json:"id"`
	Title     string `json:"title"` // first user message truncated
	UpdatedAt string `json:"updatedAt"`
	Count     int    `json:"count"`
}
type SessionCreateReq struct {
	Title string `json:"title,omitempty"`
}
type SessionCreateResp struct {
	ID string `json:"id"`
}
type SessionDeleteReq struct {
	ID string `json:"id"`
}
type SessionDataReq struct {
	ID string `json:"id"`
}
type SessionDataResp struct {
	ID       string        `json:"id"`
	Messages []llm.Message `json:"messages"`
}
type SessionRenameReq struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}
