package agent

import (
	"testing"

	"excelsior/pkg/llm"
)

func TestSanitizeToolCalls(t *testing.T) {
	answered := llm.Message{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "1", Function: llm.FuncCall{Name: "bash"}}}}
	toolResult := llm.Message{Role: "tool", ToolCallID: "1", Content: "ok"}

	// Dangling call at the end of history gets a placeholder.
	got := sanitizeToolCalls([]llm.Message{
		{Role: "user", Content: "hi"},
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "dangling", Function: llm.FuncCall{Name: "bash"}}}},
	})
	if len(got) != 3 || got[2].Role != "tool" || got[2].ToolCallID != "dangling" {
		t.Fatalf("expected dangling call answered, got %+v", got)
	}

	// Dangling call followed by a user message gets a placeholder inserted before it.
	got = sanitizeToolCalls([]llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "x", Function: llm.FuncCall{Name: "bash"}}}},
		{Role: "user", Content: "next"},
	})
	if len(got) != 3 || got[1].Role != "tool" || got[1].ToolCallID != "x" {
		t.Fatalf("expected placeholder before user message, got %+v", got)
	}

	// Properly answered calls pass through untouched.
	in := []llm.Message{{Role: "user", Content: "hi"}, answered, toolResult, {Role: "assistant", Content: "done"}}
	if got = sanitizeToolCalls(in); len(got) != 4 {
		t.Fatalf("expected answered pair untouched, got %+v", got)
	}
}
