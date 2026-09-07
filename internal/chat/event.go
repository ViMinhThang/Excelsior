package chat

import "excelsior/pkg/llm"

// Terminal outcome statuses.
const (
	OutcomeSucceeded         = "succeeded"
	OutcomeFailed            = "failed"
	OutcomeCanceled          = "canceled"
	OutcomePersistenceFailed = "persistence_failed"
)

// Interaction kinds.
const (
	InteractionPermission = "permission"
	InteractionAsk        = "ask"
)

// Event is the transport-neutral event emitted during a chat turn.
type Event struct {
	SessionID    string
	RunID        string
	Type         string
	Text         string
	Reasoning    string
	ToolName     string
	ToolCallID   string
	ToolArgs     string
	ToolResult   string
	FinishReason string
	Usage        *llm.Usage
}

// Outcome represents the authoritative terminal state of a run.
type Outcome struct {
	SessionID string `json:"sessionId"`
	RunID     string `json:"runId"`
	Status    string `json:"status"` // succeeded | failed | canceled | persistence_failed
	Persisted bool   `json:"persisted"`
	Error     string `json:"error,omitempty"`
	Code      string `json:"code,omitempty"`
}

// PermissionData describes a tool action requiring approval.
type PermissionData struct {
	Tool     string `json:"tool"`
	FilePath string `json:"filePath,omitempty"`
	Preview  string `json:"preview,omitempty"`
	Command  string `json:"command,omitempty"`
}

// AskData describes a user question requested by an agent.
type AskData struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
}

// PendingInteraction represents an awaiting user decision.
type PendingInteraction struct {
	ID         string          `json:"id"`
	Kind       string          `json:"kind"` // "permission" | "ask"
	SessionID  string          `json:"sessionId"`
	RunID      string          `json:"runId"`
	Permission *PermissionData `json:"permission,omitempty"`
	Ask        *AskData        `json:"ask,omitempty"`
}

// Snapshot contains the authoritative state of a session at subscription time.
type Snapshot struct {
	SessionID string              `json:"sessionId"`
	RunID     string              `json:"runId,omitempty"`
	Running   bool                `json:"running"`
	Messages  []llm.Message       `json:"messages"`
	Events    []Event             `json:"events,omitempty"`
	Pending   *PendingInteraction `json:"pending,omitempty"`
}

