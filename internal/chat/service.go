package chat

import (
	"context"
	"errors"
	"fmt"
	"time"

	"excelsior/pkg/agent"
	"excelsior/pkg/llm"
	"excelsior/pkg/session"
)

// ErrPersistenceFailed indicates the model run generated a result but saving to disk failed.
var ErrPersistenceFailed = errors.New("persistence failed")

// Service owns one chat turn and its optional session persistence.
// Transport code supplies the runner and event sink; it does not save history.
type Service struct {
	Runner agent.Runner
	Store  session.Store
}

// Request contains the conversation for one turn.
type Request struct {
	SessionID string
	Messages  []llm.Message
	OnEvent   func(Event)
}

// PreparedTurn contains pre-loaded history and record for single-load execution.
type PreparedTurn struct {
	SessionID string
	RunID     string
	Messages  []llm.Message
	Record    session.Record
	OnEvent   func(Event)
	OnPersist func()
}

// RunPrepared executes the turn using already loaded history and updates the provided record.
func (s Service) RunPrepared(ctx context.Context, turn PreparedTurn) (*agent.RunResult, error) {
	result, err := s.Runner.RunWithHistory(ctx, agent.RunOptions{
		Messages: turn.Messages,
		OnEvent: func(event agent.StreamEvent) {
			if turn.OnEvent != nil {
				turn.OnEvent(Event{
					SessionID:    turn.SessionID,
					RunID:        turn.RunID,
					Type:         event.Type,
					Text:         event.Text,
					Reasoning:    event.Reasoning,
					ToolName:     event.ToolName,
					ToolCallID:   event.ToolCallID,
					ToolArgs:     event.ToolArgs,
					ToolResult:   event.ToolResult,
					FinishReason: event.FinishReason,
					Usage:        event.Usage,
				})
			}
		},
	})
	if err != nil || result == nil {
		return result, err
	}
	if s.Store == nil || turn.SessionID == "" {
		return result, nil
	}

	if turn.OnPersist != nil {
		turn.OnPersist()
	}

	rec := turn.Record
	if rec.ID == "" {
		rec.ID = turn.SessionID
	}
	if rec.CreatedAt.IsZero() {
		rec.CreatedAt = time.Now().UTC()
	}
	rec.Messages = withoutSystemMessages(result.Messages)
	if saveErr := s.Store.Save(rec); saveErr != nil {
		return result, fmt.Errorf("%w: %v", ErrPersistenceFailed, saveErr)
	}
	return result, nil
}

// Run executes a turn and persists the resulting replay-safe history when a
// session store and session ID are provided. History is loaded only once.
func (s Service) Run(ctx context.Context, req Request) (*agent.RunResult, error) {
	var record session.Record
	var history []llm.Message
	if s.Store != nil && req.SessionID != "" {
		rec, err := s.Store.Load(req.SessionID)
		if err != nil && !errors.Is(err, session.ErrSessionNotFound) {
			return nil, err
		}
		if err == nil {
			record = rec
			for _, message := range record.Messages {
				if message.Role == "system" && (message.Content == "New session" || message.Content == "(empty)") {
					continue
				}
				history = append(history, message)
			}
		} else {
			record = session.Record{ID: req.SessionID, CreatedAt: time.Now().UTC()}
		}
	}
	messages := append(history, req.Messages...)
	return s.RunPrepared(ctx, PreparedTurn{
		SessionID: req.SessionID,
		Messages:  messages,
		Record:    record,
		OnEvent:   req.OnEvent,
	})
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
