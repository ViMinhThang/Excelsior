package chat

// Event is the transport-neutral event emitted during a chat turn.
type Event struct {
	Type         string
	Text         string
	Reasoning    string
	ToolName     string
	ToolCallID   string
	ToolArgs     string
	ToolResult   string
	FinishReason string
}
