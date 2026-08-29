package agent

import (
	"context"
	"errors"
	"testing"

	"excelsior/pkg/llm"
)

// TestAgent_StreamChatNilReturns verifies that agent.Run and agent.RunWithHistory
// gracefully handle nil *llm.Message and nil errors without panicking.
func TestAgent_StreamChatNilReturns(t *testing.T) {
	testCases := []struct {
		name          string
		responses     []MockTurnResponse
		expectNilMsg  bool
		expectErrIs   error
		expectPhase   string
	}{
		{
			name: "StreamChat returns (nil, nil) on first turn",
			responses: []MockTurnResponse{
				{
					Message: nil,
					Err:     nil,
				},
			},
			expectNilMsg: true,
			expectErrIs:  ErrNilLLMMessage,
			expectPhase:  "stream_chat",
		},
		{
			name: "StreamChat emits deltas then returns (nil, nil)",
			responses: []MockTurnResponse{
				{
					Message: nil,
					Deltas: []llm.Delta{
						{ReasoningContent: "Thinking..."},
						{Content: "Partial answer..."},
					},
					Err: nil,
				},
			},
			expectNilMsg: true,
			expectErrIs:  ErrNilLLMMessage,
			expectPhase:  "stream_chat",
		},
		{
			name: "StreamChat returns (nil, customErr)",
			responses: []MockTurnResponse{
				{
					Message: nil,
					Err:     errors.New("custom upstream network dropped"),
				},
			},
			expectNilMsg: true,
			expectPhase:  "stream_chat",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := &MockLLM{
				Responses: tc.responses,
			}

			ag := &Agent{
				LLM: mock,
			}

			var streamEvents []StreamEvent
			opts := RunOptions{
				Messages: []llm.Message{{Role: "user", Content: "Hello"}},
				OnEvent: func(ev StreamEvent) {
					streamEvents = append(streamEvents, ev)
				},
			}

			// 1. Test Run()
			msg, err := ag.Run(context.Background(), opts)
			if err == nil {
				t.Fatal("expected error from ag.Run, got nil")
			}
			if msg != nil {
				t.Fatalf("expected nil *llm.Message, got %+v", msg)
			}

			if tc.expectErrIs != nil && !errors.Is(err, tc.expectErrIs) {
				t.Errorf("expected errors.Is(err, %v), got %v", tc.expectErrIs, err)
			}

			var agentErr *AgentError
			if !errors.As(err, &agentErr) {
				t.Fatalf("expected *AgentError, got %T: %v", err, err)
			}
			if tc.expectPhase != "" && agentErr.Phase != tc.expectPhase {
				t.Errorf("expected Phase %q, got %q", tc.expectPhase, agentErr.Phase)
			}

			// Verify error event was emitted
			hasErrorEvent := false
			for _, ev := range streamEvents {
				if ev.Type == "error" {
					hasErrorEvent = true
					break
				}
			}
			if !hasErrorEvent {
				t.Errorf("expected error StreamEvent emitted, got: %+v", streamEvents)
			}

			// 2. Test RunWithHistory()
			mock.CallIndex = 0 // Reset mock
			mock.Calls = nil
			res, errHistory := ag.RunWithHistory(context.Background(), opts)
			if errHistory == nil {
				t.Fatal("expected error from ag.RunWithHistory, got nil")
			}
			if res != nil {
				t.Fatalf("expected nil *RunResult, got %+v", res)
			}
		})
	}
}

// TestAgent_EmptyMessageContentLoopsUntilLimit tests when LLM returns non-nil message with empty content and no tool calls.
func TestAgent_EmptyMessageContentLoopsUntilLimit(t *testing.T) {
	// If LLM returns empty message (no content, no reasoning, no tool calls), agent continues loop
	mock := &MockLLM{
		Responses: []MockTurnResponse{
			{
				Message: &llm.Message{Role: "assistant", Content: "", ReasoningContent: ""},
			},
			{
				Message: &llm.Message{Role: "assistant", Content: "Finally some text", ReasoningContent: ""},
			},
		},
	}

	ag := &Agent{
		LLM:      mock,
		MaxIters: 5,
	}

	res, err := ag.RunWithHistory(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "Hi"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.FinalMessage.Content != "Finally some text" {
		t.Errorf("expected 'Finally some text', got %q", res.FinalMessage.Content)
	}
	if len(mock.Calls) != 2 {
		t.Errorf("expected 2 calls, got %d", len(mock.Calls))
	}
}
