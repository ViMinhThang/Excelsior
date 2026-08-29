package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"excelsior/pkg/llm"
)

type MockTurnResponse struct {
	Message *llm.Message
	Deltas  []llm.Delta
	Err     error
}

type MockLLM struct {
	mu        sync.Mutex
	Responses []MockTurnResponse
	Calls     []llm.ChatRequest
	CallIndex int
}

func (m *MockLLM) ModelName() string { return "mock" }

func (m *MockLLM) StreamChat(ctx context.Context, req llm.ChatRequest, onDelta func(llm.Delta) error) (*llm.Message, error) {
	m.mu.Lock()
	m.Calls = append(m.Calls, req)
	if m.CallIndex >= len(m.Responses) {
		m.mu.Unlock()
		return nil, fmt.Errorf("mock_llm: unexpected call %d (only %d responses configured)", m.CallIndex+1, len(m.Responses))
	}
	resp := m.Responses[m.CallIndex]
	m.CallIndex++
	m.mu.Unlock()

	if resp.Err != nil {
		return nil, resp.Err
	}

	for _, d := range resp.Deltas {
		if onDelta != nil {
			if err := onDelta(d); err != nil {
				return nil, err
			}
		}
	}

	return resp.Message, nil
}

type MockTool struct {
	ToolName        string
	ToolDescription string
	ToolParams      any
	ExecuteFunc     func(ctx context.Context, args json.RawMessage) (string, error)
}

func (t *MockTool) Name() string        { return t.ToolName }
func (t *MockTool) Description() string { return t.ToolDescription }
func (t *MockTool) Parameters() any     { return t.ToolParams }
func (t *MockTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if t.ExecuteFunc != nil {
		return t.ExecuteFunc(ctx, args)
	}
	return "mock tool output", nil
}
