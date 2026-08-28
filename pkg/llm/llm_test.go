package llm

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestStreamChat_ReasoningAndToolCalls(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		chunks := []string{
			`data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"Let me check the files."}}]}`,
			`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"view","arguments":"{\"filePath\":\"main.go\"}}"}}]}}]}`,
			`data: {"choices":[{"finish_reason":"tool_calls"}]}`,
			`data: [DONE]`,
		}
		for _, c := range chunks {
			w.Write([]byte(c + "\n"))
			w.(http.Flusher).Flush()
		}
	}))
	defer srv.Close()

	c := &Client{APIKey: "sk-test", BaseURL: srv.URL, Model: "deepseek-reasoner", HTTPClient: srv.Client()}
	var reasoningDeltas []string
	var toolCallDeltas []ToolCallDelta

	msg, err := c.StreamChat(context.Background(), ChatRequest{
		Messages: []Message{{Role: "user", Content: "Inspect main.go"}},
	}, func(d Delta) error {
		if d.ReasoningContent != "" {
			reasoningDeltas = append(reasoningDeltas, d.ReasoningContent)
		}
		if len(d.ToolCalls) > 0 {
			toolCallDeltas = append(toolCallDeltas, d.ToolCalls...)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat failed: %v", err)
	}

	if msg.ReasoningContent != "Let me check the files." {
		t.Errorf("unexpected reasoning_content: %q", msg.ReasoningContent)
	}
	if len(msg.ToolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(msg.ToolCalls))
	}
	if msg.ToolCalls[0].Function.Name != "view" {
		t.Errorf("tool name mismatch: %q", msg.ToolCalls[0].Function.Name)
	}
	if len(reasoningDeltas) != 1 || reasoningDeltas[0] != "Let me check the files." {
		t.Errorf("reasoning deltas mismatch: %v", reasoningDeltas)
	}
	if len(toolCallDeltas) != 1 {
		t.Errorf("tool call deltas mismatch: %v", toolCallDeltas)
	}
}

func TestRetryPolicy_IsRetryable(t *testing.T) {
	retryableStatuses := []int{
		http.StatusTooManyRequests,
		http.StatusBadGateway,
		http.StatusServiceUnavailable,
		http.StatusGatewayTimeout,
		http.StatusInternalServerError,
	}
	for _, status := range retryableStatuses {
		if !isRetryable(status, nil) {
			t.Errorf("status %d should be retryable", status)
		}
	}

	nonRetryableStatuses := []int{
		http.StatusOK,
		http.StatusBadRequest,
		http.StatusUnauthorized,
		http.StatusForbidden,
		http.StatusNotFound,
	}
	for _, status := range nonRetryableStatuses {
		if isRetryable(status, nil) {
			t.Errorf("status %d should not be retryable", status)
		}
	}

	// Context canceled is not retryable
	if isRetryable(0, context.Canceled) {
		t.Error("context.Canceled should not be retryable")
	}

	// Generic network error is retryable
	if !isRetryable(0, errors.New("connection reset by peer")) {
		t.Error("generic network error should be retryable")
	}
}

func TestRetryPolicy_Backoff(t *testing.T) {
	policy := RetryPolicy{MaxRetries: 3, BaseDelay: 100 * time.Millisecond}

	// First attempt
	should, delay := policy.shouldRetry(http.StatusTooManyRequests, nil, 0)
	if !should || delay < 100*time.Millisecond {
		t.Errorf("expected retry with backoff >= 100ms, got should=%v delay=%v", should, delay)
	}

	// Exceeded max retries
	should, _ = policy.shouldRetry(http.StatusTooManyRequests, nil, 3)
	if should {
		t.Error("should not retry when attempt >= MaxRetries")
	}
}

func TestSSE_LineTooLarge(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		// Write a huge single line exceeding maxSSLine (1 MiB)
		hugeLine := "data: " + strings.Repeat("x", maxSSLine+10) + "\n"
		w.Write([]byte(hugeLine))
	}))
	defer srv.Close()

	c := &Client{APIKey: "sk-test", BaseURL: srv.URL, HTTPClient: srv.Client()}
	_, err := c.StreamChat(context.Background(), ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}}, nil)
	if err == nil {
		t.Fatal("expected error on oversized SSE line")
	}
	if !strings.Contains(err.Error(), "SSE line too large") {
		t.Errorf("unexpected error message: %v", err)
	}
}
