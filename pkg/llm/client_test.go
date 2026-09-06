package llm

import (
	"testing"
)

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
