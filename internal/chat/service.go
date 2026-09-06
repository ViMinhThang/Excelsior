package chat

import (
	"context"
	"time"

	"excelsior/pkg/agent"
	"excelsior/pkg/llm"
	"excelsior/pkg/session"
)

// Service owns one chat turn and its optional session persistence.
// Transport code supplies the runner and event sink; it does not save history.
type Service struct {
	Runner agent.Runner
	Store  session.Store
}

// Request contains the already-loaded conversation for one turn.
type Request struct {
	SessionID string
	Messages  []llm.Message
	OnEvent   func(Event)
}

// Run executes a turn and persists the resulting replay-safe history when a
// session store and session ID are provided.
func (s Service) Run(ctx context.Context, req Request) (*agent.RunResult, error) {
	messages := s.history(req.SessionID, req.Messages)
	result, err := s.Runner.RunWithHistory(ctx, agent.RunOptions{
		Messages: messages,
		OnEvent: func(event agent.StreamEvent) {
			if req.OnEvent != nil {
				req.OnEvent(Event{
					Type:         event.Type,
					Text:         event.Text,
					Reasoning:    event.Reasoning,
					ToolName:     event.ToolName,
					ToolCallID:   event.ToolCallID,
					ToolArgs:     event.ToolArgs,
					ToolResult:   event.ToolResult,
					FinishReason: event.FinishReason,
				})
			}
		},
	})
	if err != nil || result == nil || s.Store == nil || req.SessionID == "" {
		return result, err
	}

	persisted := withoutSystemMessages(result.Messages)
	record, loadErr := s.Store.Load(req.SessionID)
	if loadErr != nil {
		record = session.Record{ID: req.SessionID, CreatedAt: time.Now().UTC()}
	}
	record.Messages = persisted
	if err := s.Store.Save(record); err != nil {
		return nil, err
	}
	return result, nil
}

func (s Service) history(sessionID string, incoming []llm.Message) []llm.Message {
	if s.Store == nil || sessionID == "" {
		return incoming
	}
	var history []llm.Message
	if record, err := s.Store.Load(sessionID); err == nil {
		for _, message := range record.Messages {
			if message.Role == "system" && (message.Content == "New session" || message.Content == "(empty)") {
				continue
			}
			history = append(history, message)
		}
	}
	return append(history, incoming...)
}

func withoutSystemMessages(messages []llm.Message) []llm.Message {
	out := make([]llm.Message, 0, len(messages))
	for _, message := range messages {
		if message.Role != "system" {
			out = append(out, message)
		}
	}
	return out
}
