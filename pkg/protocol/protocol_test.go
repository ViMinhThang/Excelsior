package protocol

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"excelsior/pkg/llm"
)

func TestEnvelopeSerialization(t *testing.T) {
	env := Envelope{
		Ver:  Ver,
		ID:   "env-123",
		Type: TypePing,
	}

	data, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal Envelope failed: %v", err)
	}

	var decoded Envelope
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal Envelope failed: %v", err)
	}

	if decoded.Ver != Ver || decoded.ID != "env-123" || decoded.Type != TypePing {
		t.Errorf("decoded Envelope mismatch: got %+v, want %+v", decoded, env)
	}
}

func TestAllProtocolMessageTypesSerialization(t *testing.T) {
	testCases := []struct {
		name    string
		msgType string
		payload any
	}{
		{
			name:    "chat.req",
			msgType: TypeChatReq,
			payload: ChatReq{
				SessionID: "sess-1",
				Model:     "deepseek-chat",
				Messages: []llm.Message{
					{Role: "user", Content: "Hello world"},
				},
			},
		},
		{
			name:    "delta_text",
			msgType: TypeDelta,
			payload: Delta{
				Type: "text",
				Text: "Hello there!",
			},
		},
		{
			name:    "delta_reasoning",
			msgType: TypeDelta,
			payload: Delta{
				Type:      "reasoning",
				Reasoning: "Thinking about the question...",
			},
		},
		{
			name:    "delta_tool_call",
			msgType: TypeDelta,
			payload: Delta{
				Type:       "tool_start",
				ToolName:   "view",
				ToolCallID: "call-99",
				ToolArgs:   `{"path":"main.go"}`,
			},
		},
		{
			name:    "delta_tool_result",
			msgType: TypeDelta,
			payload: Delta{
				Type:       "tool_result",
				ToolName:   "view",
				ToolCallID: "call-99",
				ToolResult: "package main...",
			},
		},
		{
			name:    "delta_done",
			msgType: TypeDelta,
			payload: Delta{
				Type:         "done",
				FinishReason: "stop",
			},
		},
		{
			name:    "done",
			msgType: TypeDone,
			payload: map[string]string{"sessionId": "sess-1"},
		},
		{
			name:    "error",
			msgType: TypeError,
			payload: map[string]string{"error": "something went wrong"},
		},
		{
			name:    "ask.req",
			msgType: TypeAskReq,
			payload: AskReq{
				Question: "Which file do you want to modify?",
				Options:  []string{"A", "B", "C"},
			},
		},
		{
			name:    "ask.resp",
			msgType: TypeAskResp,
			payload: AskResp{
				Selected: 1,
				Answer:   "B",
				Label:    "Option B",
			},
		},
		{
			name:    "ping",
			msgType: TypePing,
			payload: nil,
		},
		{
			name:    "pong",
			msgType: TypePong,
			payload: nil,
		},
		{
			name:    "session.list_req",
			msgType: TypeSessionList,
			payload: SessionListReq{},
		},
		{
			name:    "session.list_resp",
			msgType: TypeSessionList,
			payload: SessionListResp{
				Sessions: []SessionInfo{
					{ID: "sess-1", Title: "First Session", UpdatedAt: "2026-08-28T00:00:00Z", Count: 5},
				},
			},
		},
		{
			name:    "session.data_req",
			msgType: TypeSessionData,
			payload: SessionDataReq{ID: "sess-1"},
		},
		{
			name:    "session.data_resp",
			msgType: TypeSessionData,
			payload: SessionDataResp{
				ID: "sess-1",
				Messages: []llm.Message{
					{Role: "user", Content: "hello"},
					{Role: "assistant", Content: "hi"},
				},
			},
		},
		{
			name:    "session.create_req",
			msgType: TypeSessionCreate,
			payload: SessionCreateReq{Title: "New Feature Session"},
		},
		{
			name:    "session.create_resp",
			msgType: TypeSessionCreate,
			payload: SessionCreateResp{ID: "sess-new-123"},
		},
		{
			name:    "session.delete_req",
			msgType: TypeSessionDelete,
			payload: SessionDeleteReq{ID: "sess-old"},
		},
		{
			name:    "session.rename_req",
			msgType: TypeSessionRename,
			payload: SessionRenameReq{ID: "sess-1", Title: "Updated Title"},
		},
		{
			name:    "workspace.set_req",
			msgType: TypeWorkspaceSet,
			payload: WorkspaceSetReq{Workspace: "/path/to/project"},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			raw, err := json.Marshal(tc.payload)
			if err != nil {
				t.Fatalf("marshal payload for %s: %v", tc.name, err)
			}
			env := Envelope{
				Ver:     Ver,
				ID:      "test-id",
				Type:    tc.msgType,
				Payload: raw,
			}

			data, err := json.Marshal(env)
			if err != nil {
				t.Fatalf("failed to marshal envelope for %s: %v", tc.name, err)
			}

			var decoded Envelope
			if err := json.Unmarshal(data, &decoded); err != nil {
				t.Fatalf("failed to unmarshal envelope for %s: %v", tc.name, err)
			}

			if decoded.Type != tc.msgType {
				t.Errorf("type mismatch: got %q, want %q", decoded.Type, tc.msgType)
			}
			if decoded.Ver != Ver {
				t.Errorf("ver mismatch: got %q, want %q", decoded.Ver, Ver)
			}
		})
	}
}

func TestChatReqRoundTrip(t *testing.T) {
	req := ChatReq{
		SessionID: "sess-abc",
		Model:     "deepseek-reasoner",
		Messages: []llm.Message{
			{Role: "system", Content: "You are an assistant."},
			{Role: "user", Content: "What is 2+2?"},
			{Role: "assistant", Content: "4", ReasoningContent: "2+2 equals 4."},
		},
	}

	b, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal ChatReq: %v", err)
	}

	var decoded ChatReq
	if err := json.Unmarshal(b, &decoded); err != nil {
		t.Fatalf("unmarshal ChatReq: %v", err)
	}

	if decoded.SessionID != req.SessionID || decoded.Model != req.Model || len(decoded.Messages) != 3 {
		t.Fatalf("decoded ChatReq mismatch: %+v", decoded)
	}
	if decoded.Messages[2].ReasoningContent != "2+2 equals 4." {
		t.Errorf("reasoning content not preserved: got %q", decoded.Messages[2].ReasoningContent)
	}
}

func TestEnvelopeDecode_Errors(t *testing.T) {
	env := Envelope{
		Ver:     Ver,
		Type:    TypeChatReq,
		Payload: json.RawMessage(`{not-valid-json`),
	}
	var req ChatReq
	err := env.Decode(&req)
	if err == nil {
		t.Fatal("expected error decoding invalid json")
	}
	if !errors.Is(err, ErrInvalidPayload) {
		t.Errorf("expected errors.Is(err, ErrInvalidPayload), got %v", err)
	}
	if s := err.Error(); !strings.Contains(s, "decode") || !strings.Contains(s, TypeChatReq) {
		t.Errorf("expected op+type in message, got %q", s)
	}
}

func TestNewEnvelopeHelpers(t *testing.T) {
	env1 := NewEnvelope(TypePing, map[string]string{"foo": "bar"})
	if env1.Ver != Ver || env1.Type != TypePing || env1.ID != "" {
		t.Errorf("unexpected NewEnvelope: %+v", env1)
	}

	env2 := NewEnvelopeWithID("id-99", TypeDone, map[string]string{"status": "ok"})
	if env2.Ver != Ver || env2.Type != TypeDone || env2.ID != "id-99" {
		t.Errorf("unexpected NewEnvelopeWithID: %+v", env2)
	}

	// Decode empty payload
	envEmpty := Envelope{Ver: Ver, Type: TypePong}
	var dummy map[string]string
	if err := envEmpty.Decode(&dummy); err != nil {
		t.Errorf("Decode on empty payload should succeed, got %v", err)
	}
}

