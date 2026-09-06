package agent

import "excelsior/pkg/llm"

// Stream event types emitted during [Agent.Run] and [Agent.RunWithHistory].
const (
	EventTypeText       = "text"
	EventTypeReasoning  = "reasoning"
	EventTypeToolStart  = "tool_start"
	EventTypeToolResult = "tool_result"
	EventTypeDone       = "done"
	EventTypeError      = "error"
)

// NewTextEvent creates a StreamEvent representing streaming assistant text.
func NewTextEvent(text string) StreamEvent {
	return StreamEvent{Type: EventTypeText, Text: text}
}

// NewReasoningEvent creates a StreamEvent representing model reasoning content.
func NewReasoningEvent(reasoning string) StreamEvent {
	return StreamEvent{Type: EventTypeReasoning, Reasoning: reasoning}
}

// NewToolStartEvent creates a StreamEvent representing tool execution start.
func NewToolStartEvent(name, callID, args string) StreamEvent {
	return StreamEvent{
		Type:       EventTypeToolStart,
		ToolName:   name,
		ToolCallID: callID,
		ToolArgs:   args,
	}
}

// NewToolResultEvent creates a StreamEvent representing tool execution completion.
func NewToolResultEvent(name, callID, result string) StreamEvent {
	return StreamEvent{
		Type:       EventTypeToolResult,
		ToolName:   name,
		ToolCallID: callID,
		ToolResult: result,
	}
}

// NewDoneEvent creates a StreamEvent representing normal completion of an agent run.
func NewDoneEvent(text, finishReason string, usage *llm.Usage) StreamEvent {
	return StreamEvent{
		Type:         EventTypeDone,
		Text:         text,
		FinishReason: finishReason,
		Usage:        usage,
	}
}

// NewErrorEvent creates a StreamEvent representing an error during an agent run.
func NewErrorEvent(errText string) StreamEvent {
	return StreamEvent{
		Type: EventTypeError,
		Text: errText,
	}
}
