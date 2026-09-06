package protocol

import (
	"encoding/json"
	"fmt"

	"excelsior/pkg/llm"
)

// Ver is the protocol version string applied to every [Envelope].
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
	if err := json.Unmarshal(e.Payload, v); err != nil {
		return &ProtocolError{
			Op:      "decode",
			MsgType: e.Type,
			Ver:     e.Ver,
			Err:     fmt.Errorf("%w: %v", ErrInvalidPayload, err),
		}
	}
	return nil
}

// MarshalPayload marshals v to json.RawMessage safely without panicking.
// Returns nil, nil if v is nil.
func MarshalPayload(v any) (json.RawMessage, error) {
	if v == nil {
		return nil, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, &ProtocolError{
			Op:  "marshal",
			Err: fmt.Errorf("%w: %v", ErrInvalidPayload, err),
		}
	}
	return b, nil
}

// NewEnvelope creates a versioned envelope with JSON payload.
func NewEnvelope(typ string, payload any) Envelope {
	if payload == nil {
		return Envelope{Ver: Ver, Type: typ}
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return Envelope{Ver: Ver, Type: typ}
	}
	return Envelope{Ver: Ver, Type: typ, Payload: b}
}

// NewEnvelopeWithID creates a versioned envelope with ID and payload.
func NewEnvelopeWithID(id, typ string, payload any) Envelope {
	if payload == nil {
		return Envelope{Ver: Ver, ID: id, Type: typ}
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return Envelope{Ver: Ver, ID: id, Type: typ}
	}
	return Envelope{Ver: Ver, ID: id, Type: typ, Payload: b}
}

// Message types for [Envelope.Type].
const (
	TypeChatReq            = "chat.req"
	TypeDelta              = "delta"
	TypeDone               = "done"
	TypeError              = "error"
	TypeAskReq             = "ask.req"
	TypeAskResp            = "ask.resp"
	TypePermissionReq      = "permission.req"
	TypePermissionResp     = "permission.resp"
	TypePing               = "ping"
	TypePong               = "pong"
	TypeSessionList        = "session.list"
	TypeSessionData        = "session.data"
	TypeSessionCreate      = "session.create"
	TypeSessionDelete      = "session.delete"
	TypeSessionRename      = "session.rename"
	TypeSessionSubscribe   = "session.subscribe"
	TypeSessionUnsubscribe = "session.unsubscribe"
	TypeWorkspaceSet       = "workspace.set"
	TypeSettingsGet        = "settings.get"
	TypeSettingsSet        = "settings.set"
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
	PromptTokens int    `json:"promptTokens,omitempty"`
	CompletionTokens int `json:"completionTokens,omitempty"`
	TotalTokens  int    `json:"totalTokens,omitempty"`
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

// PermissionReq is engine → client when agent requests mutating operation approval.
type PermissionReq struct {
	Tool     string `json:"tool"` // "write" | "edit" | "bash"
	FilePath string `json:"filePath,omitempty"`
	Preview  string `json:"preview,omitempty"`
	Command  string `json:"command,omitempty"`
}

// PermissionResp is client → engine with user decision.
type PermissionResp struct {
	Approved bool `json:"approved"`
}

// Session management (unified for TUI/web/desktop).

// SessionListReq requests the session list.
type SessionListReq struct{}

// SessionListResp contains the session list.
type SessionListResp struct {
	Sessions []SessionInfo `json:"sessions"`
}

// SessionInfo is a summary entry for the session sidebar.
type SessionInfo struct {
	ID        string `json:"id"`
	Title     string `json:"title"` // first user message truncated
	UpdatedAt string `json:"updatedAt"`
	Count     int    `json:"count"`
}

// SessionCreateReq creates a new session.
type SessionCreateReq struct {
	Title string `json:"title,omitempty"`
}

// SessionCreateResp is the result of [TypeSessionCreate].
type SessionCreateResp struct {
	ID string `json:"id"`
}

// SessionDeleteReq deletes a session.
type SessionDeleteReq struct {
	ID string `json:"id"`
}

// SessionDataReq requests the full message history for a session.
type SessionDataReq struct {
	ID string `json:"id"`
}

// SessionDataResp contains the full message history for a session.
type SessionDataResp struct {
	ID       string        `json:"id"`
	Messages []llm.Message `json:"messages"`
}

// SessionRenameReq renames a session.
type SessionRenameReq struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// SessionSubscriptionReq changes the sessions whose live events a connection receives.
type SessionSubscriptionReq struct {
	ID string `json:"id"`
}

// SettingsGetReq requests current settings (e.g. permission mode).
type SettingsGetReq struct{}

// SettingsGetResp returns current settings.
type SettingsGetResp struct {
	Permission string `json:"permission"` // ask|allow|deny
	AllowAll   bool   `json:"allowAll"`
}

// SettingsSetReq updates settings. Only provided fields are updated.
type SettingsSetReq struct {
	Permission *string `json:"permission,omitempty"`
	AllowAll   *bool   `json:"allowAll,omitempty"`
}

// SettingsSetResp confirms updated settings.
type SettingsSetResp struct {
	Permission string `json:"permission"`
	AllowAll   bool   `json:"allowAll"`
}
