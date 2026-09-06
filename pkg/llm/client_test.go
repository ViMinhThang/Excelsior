package llm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestClientStreamChatUsesGoAIProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Errorf("path = %q, want /chat/completions", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk-test" {
			t.Errorf("authorization = %q", got)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"hello \"}}]}\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"world\"}}]}\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"finish_reason\":\"stop\"}]}\n"))
		_, _ = w.Write([]byte("data: [DONE]\n"))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}))
	defer server.Close()

	var streamed strings.Builder
	client := &Client{APIKey: "sk-test", BaseURL: server.URL, Model: "deepseek-chat", HTTPClient: server.Client()}
	message, err := client.StreamChat(context.Background(), ChatRequest{
		Messages: []Message{{Role: "user", Content: "hello"}},
	}, func(delta Delta) error {
		streamed.WriteString(delta.Content)
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat() error = %v", err)
	}
	if got, want := streamed.String(), "hello world"; got != want {
		t.Errorf("streamed text = %q, want %q", got, want)
	}
	if got, want := message.Content, "hello world"; got != want {
		t.Errorf("message content = %q, want %q", got, want)
	}
}

func TestClientStreamChatForwardsToolCalls(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call-1\",\"type\":\"function\",\"function\":{\"name\":\"view\",\"arguments\":\"{\\\"filePath\\\":\\\"main.go\\\"}\"}}]}}]}\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"finish_reason\":\"tool_calls\"}]}\n"))
		_, _ = w.Write([]byte("data: [DONE]\n"))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}))
	defer server.Close()

	var received []ToolCallDelta
	client := &Client{APIKey: "sk-test", BaseURL: server.URL, Model: "deepseek-chat", HTTPClient: server.Client()}
	message, err := client.StreamChat(context.Background(), ChatRequest{
		Messages: []Message{{Role: "user", Content: "Inspect main.go"}},
		Tools:    []ToolDefinition{{Type: "function", Function: FuncDef{Name: "view", Description: "Read a file", Parameters: map[string]any{"type": "object"}}}},
	}, func(delta Delta) error {
		received = append(received, delta.ToolCalls...)
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat() error = %v", err)
	}
	if got, want := len(received), 1; got != want {
		t.Fatalf("streamed tool calls = %d, want %d", got, want)
	}
	if got, want := received[0].Function.Name, "view"; got != want {
		t.Errorf("streamed tool name = %q, want %q", got, want)
	}
	if got, want := len(message.ToolCalls), 1; got != want {
		t.Fatalf("message tool calls = %d, want %d", got, want)
	}
	if got, want := message.ToolCalls[0].Function.Arguments, `{"filePath":"main.go"}`; got != want {
		t.Errorf("tool arguments = %q, want %q", got, want)
	}
}

func TestProviderMessageRoundTrip(t *testing.T) {
	messages := []Message{
		{Role: "system", Content: "system"},
		{Role: "user", Content: "question"},
		{Role: "assistant", Content: "thinking", ReasoningContent: "reason", ToolCalls: []ToolCall{{ID: "call-1", Type: "function", Function: FuncCall{Name: "view", Arguments: `{"filePath":"main.go"}`}}}},
		{Role: "tool", ToolCallID: "call-1", Name: "view", Content: "file contents"},
	}

	providerMessages, err := toProviderMessages(messages)
	if err != nil {
		t.Fatalf("toProviderMessages() error = %v", err)
	}
	if got, want := len(providerMessages), len(messages); got != want {
		t.Fatalf("message count = %d, want %d", got, want)
	}
	if got := providerMessages[2].Content[2].ToolName; got != "view" {
		t.Errorf("tool name = %q, want view", got)
	}
	if got := providerMessages[3].Content[0].ToolOutput; got != "file contents" {
		t.Errorf("tool output = %q, want file contents", got)
	}
}

func TestProviderMessageRejectsUnknownRole(t *testing.T) {
	_, err := toProviderMessages([]Message{{Role: "invalid", Content: "x"}})
	if err == nil {
		t.Fatal("toProviderMessages() error = nil, want error")
	}
}
