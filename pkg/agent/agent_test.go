package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

func TestAgent_SimpleTextTurn(t *testing.T) {
	mock := &MockLLM{
		Responses: []MockTurnResponse{
			{
				Message: &llm.Message{
					Role:    "assistant",
					Content: "Hello! How can I help?",
				},
				Deltas: []llm.Delta{
					{Content: "Hello! "},
					{Content: "How can I help?"},
				},
			},
		},
	}

	ag := &Agent{
		LLM: mock,
	}

	var events []StreamEvent
	res, err := ag.RunWithHistory(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "Hi"}},
		OnEvent: func(ev StreamEvent) {
			events = append(events, ev)
		},
	})
	if err != nil {
		t.Fatalf("RunWithHistory failed: %v", err)
	}

	if res.FinalMessage.Content != "Hello! How can I help?" {
		t.Errorf("unexpected content: %q", res.FinalMessage.Content)
	}
	if len(events) < 3 { // text deltas + done
		t.Errorf("expected at least 3 stream events, got %d", len(events))
	}
	if events[len(events)-1].Type != "done" {
		t.Errorf("last event should be done, got %s", events[len(events)-1].Type)
	}
}

func TestAgent_ReasoningStreaming(t *testing.T) {
	mock := &MockLLM{
		Responses: []MockTurnResponse{
			{
				Message: &llm.Message{
					Role:             "assistant",
					Content:          "The answer is 42.",
					ReasoningContent: "Thinking about the universe...",
				},
				Deltas: []llm.Delta{
					{ReasoningContent: "Thinking about the universe..."},
					{Content: "The answer is 42."},
				},
			},
		},
	}

	ag := &Agent{
		LLM: mock,
	}

	var reasoningEvents []string
	var textEvents []string
	_, err := ag.Run(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "What is the answer?"}},
		OnEvent: func(ev StreamEvent) {
			if ev.Type == "reasoning" {
				reasoningEvents = append(reasoningEvents, ev.Reasoning)
			}
			if ev.Type == "text" {
				textEvents = append(textEvents, ev.Text)
			}
		},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if len(reasoningEvents) != 1 || reasoningEvents[0] != "Thinking about the universe..." {
		t.Errorf("reasoning event mismatch: %v", reasoningEvents)
	}
	if len(textEvents) != 1 || textEvents[0] != "The answer is 42." {
		t.Errorf("text event mismatch: %v", textEvents)
	}
}

func TestAgent_ToolInvocationLoop(t *testing.T) {
	toolExecuted := false
	mockTool := &MockTool{
		ToolName: "fetch_data",
		ExecuteFunc: func(ctx context.Context, args json.RawMessage) (string, error) {
			toolExecuted = true
			return `{"status":"ok","items":["a","b"]}`, nil
		},
	}

	registry := tools.NewRegistry(mockTool)

	mock := &MockLLM{
		Responses: []MockTurnResponse{
			// Turn 1: Assistant calls fetch_data
			{
				Message: &llm.Message{
					Role: "assistant",
					ToolCalls: []llm.ToolCall{
						{
							ID:   "call-1",
							Type: "function",
							Function: llm.FuncCall{
								Name:      "fetch_data",
								Arguments: `{}`,
							},
						},
					},
				},
			},
			// Turn 2: Assistant consumes tool result and finishes
			{
				Message: &llm.Message{
					Role:    "assistant",
					Content: "Found 2 items: a, b.",
				},
			},
		},
	}

	ag := &Agent{
		LLM:   mock,
		Tools: registry,
	}

	var events []StreamEvent
	res, err := ag.RunWithHistory(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "Fetch items"}},
		OnEvent: func(ev StreamEvent) {
			events = append(events, ev)
		},
	})
	if err != nil {
		t.Fatalf("RunWithHistory failed: %v", err)
	}

	if !toolExecuted {
		t.Error("expected tool to be executed")
	}
	if res.FinalMessage.Content != "Found 2 items: a, b." {
		t.Errorf("unexpected final content: %q", res.FinalMessage.Content)
	}

	// Verify history contains user msg, assistant tool call msg, tool role result msg, and final assistant msg
	if len(res.Messages) != 4 {
		t.Fatalf("expected 4 messages in conversation history, got %d", len(res.Messages))
	}
	if res.Messages[2].Role != "tool" || !strings.Contains(res.Messages[2].Content, "ok") {
		t.Errorf("expected tool result message in history, got: %+v", res.Messages[2])
	}
}

func TestAgent_MultipleSequentialToolCalls(t *testing.T) {
	var toolCallsList []string
	tool1 := &MockTool{
		ToolName: "tool_1",
		ExecuteFunc: func(ctx context.Context, args json.RawMessage) (string, error) {
			toolCallsList = append(toolCallsList, "tool_1")
			return "result_1", nil
		},
	}
	tool2 := &MockTool{
		ToolName: "tool_2",
		ExecuteFunc: func(ctx context.Context, args json.RawMessage) (string, error) {
			toolCallsList = append(toolCallsList, "tool_2")
			return "result_2", nil
		},
	}

	registry := tools.NewRegistry(tool1, tool2)

	mock := &MockLLM{
		Responses: []MockTurnResponse{
			// Turn 1: Assistant calls both tool_1 and tool_2
			{
				Message: &llm.Message{
					Role: "assistant",
					ToolCalls: []llm.ToolCall{
						{ID: "c1", Type: "function", Function: llm.FuncCall{Name: "tool_1", Arguments: `{}`}},
						{ID: "c2", Type: "function", Function: llm.FuncCall{Name: "tool_2", Arguments: `{}`}},
					},
				},
			},
			// Turn 2: Assistant finishes
			{
				Message: &llm.Message{
					Role:    "assistant",
					Content: "Both tools completed.",
				},
			},
		},
	}

	ag := &Agent{
		LLM:   mock,
		Tools: registry,
	}

	res, err := ag.Run(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "Run both"}},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if len(toolCallsList) != 2 || toolCallsList[0] != "tool_1" || toolCallsList[1] != "tool_2" {
		t.Errorf("tools execution order mismatch: %v", toolCallsList)
	}
	if res.Content != "Both tools completed." {
		t.Errorf("unexpected content: %q", res.Content)
	}
}

func TestAgent_ToolExecutionError(t *testing.T) {
	failingTool := &MockTool{
		ToolName: "fail_tool",
		ExecuteFunc: func(ctx context.Context, args json.RawMessage) (string, error) {
			return "", errors.New("disk full")
		},
	}

	mock := &MockLLM{
		Responses: []MockTurnResponse{
			{
				Message: &llm.Message{
					Role: "assistant",
					ToolCalls: []llm.ToolCall{
						{ID: "c1", Type: "function", Function: llm.FuncCall{Name: "fail_tool", Arguments: `{}`}},
					},
				},
			},
			{
				Message: &llm.Message{
					Role:    "assistant",
					Content: "I encountered an error: disk full.",
				},
			},
		},
	}

	ag := &Agent{
		LLM:   mock,
		Tools: tools.NewRegistry(failingTool),
	}

	res, err := ag.RunWithHistory(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "Do something"}},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if !strings.Contains(res.Messages[2].Content, "error: disk full") {
		t.Errorf("expected error message in tool result, got %q", res.Messages[2].Content)
	}
}

func TestAgent_UnknownToolHandling(t *testing.T) {
	mock := &MockLLM{
		Responses: []MockTurnResponse{
			{
				Message: &llm.Message{
					Role: "assistant",
					ToolCalls: []llm.ToolCall{
						{ID: "c1", Type: "function", Function: llm.FuncCall{Name: "mystery_tool", Arguments: `{}`}},
					},
				},
			},
			{
				Message: &llm.Message{
					Role:    "assistant",
					Content: "Mystery tool is not available.",
				},
			},
		},
	}

	ag := &Agent{
		LLM:   mock,
		Tools: tools.NewRegistry(),
	}

	res, err := ag.RunWithHistory(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "Run mystery"}},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if !strings.Contains(res.Messages[2].Content, "unknown tool \"mystery_tool\"") {
		t.Errorf("expected unknown tool warning in tool result, got %q", res.Messages[2].Content)
	}
}

func TestAgent_MaxIterationsCap(t *testing.T) {
	mockTool := &MockTool{
		ToolName: "loop_tool",
		ExecuteFunc: func(ctx context.Context, args json.RawMessage) (string, error) {
			return "looping", nil
		},
	}

	// Always returns tool call
	infiniteResponses := make([]MockTurnResponse, 10)
	for i := range infiniteResponses {
		infiniteResponses[i] = MockTurnResponse{
			Message: &llm.Message{
				Role: "assistant",
				ToolCalls: []llm.ToolCall{
					{ID: "c", Type: "function", Function: llm.FuncCall{Name: "loop_tool", Arguments: `{}`}},
				},
			},
		}
	}

	ag := &Agent{
		LLM:      &MockLLM{Responses: infiniteResponses},
		Tools:    tools.NewRegistry(mockTool),
		MaxIters: 3,
	}

	_, err := ag.Run(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "Loop forever"}},
	})
	if err == nil || !strings.Contains(err.Error(), "max iterations (3) reached") {
		t.Fatalf("expected max iterations reached error, got %v", err)
	}
	if !errors.Is(err, ErrMaxIterationsReached) {
		t.Fatalf("expected errors.Is(err, ErrMaxIterationsReached), got %v", err)
	}
	var agentErr *AgentError
	if !errors.As(err, &agentErr) || agentErr.Phase != "loop" {
		t.Fatalf("expected *AgentError with Phase 'loop', got %+v", agentErr)
	}
}

func TestAgent_ContextCancellationBeforeRun(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	ag := &Agent{
		LLM: &MockLLM{},
	}

	_, err := ag.Run(ctx, RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "hi"}},
	})
	if err == nil {
		t.Fatal("expected error on canceled context")
	}
	if !errors.Is(err, context.Canceled) {
		t.Errorf("expected errors.Is(err, context.Canceled), got %v", err)
	}
}

func TestAgent_SystemPromptInsertion(t *testing.T) {
	mock := &MockLLM{
		Responses: []MockTurnResponse{
			{
				Message: &llm.Message{Role: "assistant", Content: "done"},
			},
		},
	}

	ag := &Agent{
		LLM:    mock,
		System: "Custom System Instructions",
	}

	_, err := ag.RunWithHistory(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "hello"}},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if len(mock.Calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(mock.Calls))
	}
	sentMessages := mock.Calls[0].Messages
	if len(sentMessages) != 2 || sentMessages[0].Role != "system" || sentMessages[0].Content != "Custom System Instructions" {
		t.Errorf("system prompt not prepended properly: %+v", sentMessages)
	}
}

func TestAgent_ContextTooLargeGuard(t *testing.T) {
	ag := &Agent{
		LLM: &MockLLM{},
	}

	hugeContent := strings.Repeat("x", 700_000)
	_, err := ag.Run(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: hugeContent}},
	})
	if err == nil || !strings.Contains(err.Error(), "context too large") {
		t.Fatalf("expected context too large error, got %v", err)
	}
	if !errors.Is(err, ErrContextTooLarge) {
		t.Fatalf("expected errors.Is(err, ErrContextTooLarge), got %v", err)
	}
}

func TestAgent_ToolResultTruncation(t *testing.T) {
	hugeTool := &MockTool{
		ToolName: "huge_tool",
		ExecuteFunc: func(ctx context.Context, args json.RawMessage) (string, error) {
			return strings.Repeat("a", 30_000), nil
		},
	}

	mock := &MockLLM{
		Responses: []MockTurnResponse{
			{
				Message: &llm.Message{
					Role: "assistant",
					ToolCalls: []llm.ToolCall{
						{ID: "c1", Type: "function", Function: llm.FuncCall{Name: "huge_tool", Arguments: `{}`}},
					},
				},
			},
			{
				Message: &llm.Message{Role: "assistant", Content: "received truncated output"},
			},
		},
	}

	ag := &Agent{
		LLM:   mock,
		Tools: tools.NewRegistry(hugeTool),
	}

	res, err := ag.RunWithHistory(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "Get big data"}},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	toolResultMsg := res.Messages[2]
	if !strings.HasSuffix(toolResultMsg.Content, "[truncated]") {
		t.Errorf("expected tool result to be truncated, length is %d", len(toolResultMsg.Content))
	}
}

func TestAgent_ValidationErrors(t *testing.T) {
	// Nil LLM
	agNil := &Agent{}
	if _, err := agNil.Run(context.Background(), RunOptions{Messages: []llm.Message{{Role: "user", Content: "hi"}}}); err == nil {
		t.Error("expected error for nil LLM")
	} else if !errors.Is(err, ErrLLMNotConfigured) {
		t.Errorf("expected ErrLLMNotConfigured, got %v", err)
	}

	// Negative MaxIters
	agNeg := &Agent{LLM: &MockLLM{}, MaxIters: -1}
	if _, err := agNeg.Run(context.Background(), RunOptions{Messages: []llm.Message{{Role: "user", Content: "hi"}}}); err == nil {
		t.Error("expected error for negative MaxIters")
	} else if !errors.Is(err, ErrInvalidConfig) && !errors.Is(err, ErrInvalidMaxIterations) {
		t.Errorf("expected ErrInvalidMaxIterations, got %v", err)
	}

	// Empty messages
	agEmpty := &Agent{LLM: &MockLLM{}}
	if _, err := agEmpty.Run(context.Background(), RunOptions{Messages: nil}); err == nil {
		t.Error("expected error for empty messages")
	} else if !errors.Is(err, ErrEmptyMessages) {
		t.Errorf("expected ErrEmptyMessages, got %v", err)
	}
}

func TestAgent_NilLLMMessageGuard(t *testing.T) {
	mock := &MockLLM{
		Responses: []MockTurnResponse{
			{
				Message: nil, // Nil message with nil error!
			},
		},
	}
	ag := &Agent{
		LLM: mock,
	}

	_, err := ag.Run(context.Background(), RunOptions{
		Messages: []llm.Message{{Role: "user", Content: "hello"}},
	})
	if err == nil {
		t.Fatal("expected error on nil LLM message")
	}
	if !errors.Is(err, ErrNilLLMMessage) {
		t.Fatalf("expected errors.Is(err, ErrNilLLMMessage), got %v", err)
	}
}

func TestAgentError_FormattingAndUnwrap(t *testing.T) {
	ae1 := &AgentError{
		Phase:     "tool_exec",
		Iteration: 2,
		ToolName:  "view",
		Msg:       "execution failed",
		Err:       ErrUnknownTool,
	}
	if !errors.Is(ae1, ErrUnknownTool) {
		t.Errorf("expected Is(ErrUnknownTool)")
	}
	if ae1.Unwrap() != ErrUnknownTool {
		t.Errorf("expected Unwrap() to return ErrUnknownTool")
	}
	if !strings.Contains(ae1.Error(), "tool_exec") || !strings.Contains(ae1.Error(), "view") {
		t.Errorf("expected phase and tool in error string: %s", ae1.Error())
	}

	sentinels := []error{
		ErrMaxIterationsReached, ErrContextTooLarge, ErrEmptyMessages,
		ErrLLMNotConfigured, ErrInvalidConfig, ErrNilLLMMessage, ErrUnknownTool,
	}
	for _, s := range sentinels {
		ae := &AgentError{Err: s}
		if !errors.Is(ae, s) {
			t.Errorf("expected Is(%v) on AgentError", s)
		}
	}

	aeEmpty := &AgentError{}
	if aeEmpty.Error() != "agent" {
		t.Errorf("expected 'agent', got %q", aeEmpty.Error())
	}
	if aeEmpty.Is(nil) {
		t.Error("Is(nil) should be false")
	}
}

