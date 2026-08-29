package llm

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStreamChat_Success(t *testing.T) {
	// Mock DeepSeek SSE server
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			t.Error("missing auth")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		// Send chunks
		chunks := []string{
			`data: {"choices":[{"delta":{"content":"hello "}}]}`,
			`data: {"choices":[{"delta":{"content":"world"}}]}`,
			`data: {"choices":[{"finish_reason":"stop"}]}`,
			`data: [DONE]`,
		}
		for _, c := range chunks {
			w.Write([]byte(c + "\n"))
			w.(http.Flusher).Flush()
		}
	}))
	defer srv.Close()

	c := &Client{APIKey: "sk-test", BaseURL: srv.URL, Model: "deepseek-v4-flash", HTTPClient: srv.Client()}
	var got string
	msg, err := c.StreamChat(context.Background(), ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}}, func(d Delta) error {
		got += d.Content
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat err: %v", err)
	}
	if got != "hello world" {
		t.Fatalf("got %q", got)
	}
	if msg.Content != "hello world" {
		t.Fatalf("msg %q", msg.Content)
	}
}

func TestStreamChat_Retry(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]string{"error": "rate limit"})
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Write([]byte(`data: {"choices":[{"delta":{"content":"ok"}}]}` + "\n"))
		w.Write([]byte(`data: [DONE]` + "\n"))
	}))
	defer srv.Close()
	c := &Client{APIKey: "sk-test", BaseURL: srv.URL, Model: "deepseek-v4-flash", HTTPClient: srv.Client()}
	_, err := c.StreamChat(context.Background(), ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}}, func(Delta) error { return nil })
	if err != nil {
		t.Fatalf("retry err: %v", err)
	}
	if calls != 2 {
		t.Fatalf("expected 2 calls, got %d", calls)
	}
}

func TestClient_Validate(t *testing.T) {
	c := &Client{APIKey: "", BaseURL: "https://api.deepseek.com"}
	_, err := c.StreamChat(context.Background(), ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}}, nil)
	if err == nil {
		t.Fatal("expected error for empty APIKey")
	}
	if !strings.Contains(err.Error(), "APIKey") {
		t.Fatalf("expected APIKey in error string, got %v", err)
	}
	if !errors.Is(err, ErrMissingAPIKey) {
		t.Fatalf("expected errors.Is(err, ErrMissingAPIKey), got %v", err)
	}
	var llmErr *LLMError
	if !errors.As(err, &llmErr) {
		t.Fatalf("expected errors.As(err, &llmErr), got %v", err)
	}
	if llmErr.Kind != ErrorKindAuth {
		t.Errorf("expected ErrorKindAuth, got %v", llmErr.Kind)
	}

	// Invalid BaseURL
	c2 := &Client{APIKey: "sk-test", BaseURL: "://bad"}
	_, err2 := c2.StreamChat(context.Background(), ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}}, nil)
	if err2 == nil || !errors.Is(err2, ErrInvalidBaseURL) {
		t.Fatalf("expected ErrInvalidBaseURL, got %v", err2)
	}
}

func TestResolveModel_Alias(t *testing.T) {
	if got := ResolveModel("deepseek-v4-pro"); got != "deepseek-v4-pro" {
		t.Fatalf("expected deepseek-v4-pro, got %q", got)
	}
	if got := ResolveModel("deepseek-v4-flash"); got != "deepseek-v4-flash" {
		t.Fatalf("expected deepseek-v4-flash, got %q", got)
	}
	if got := ResolveModel("  deepseek-v4-pro  "); got != "deepseek-v4-pro" {
		t.Fatalf("expected trimmed deepseek-v4-pro, got %q", got)
	}
}

func TestChat_SingleCall(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Write([]byte(`data: {"choices":[{"delta":{"content":"hi"}}]}` + "\n"))
		w.Write([]byte(`data: [DONE]` + "\n"))
	}))
	defer srv.Close()
	c := &Client{APIKey: "sk-test", BaseURL: srv.URL, Model: "deepseek-v4-flash", HTTPClient: srv.Client()}
	msg, err := c.Chat(context.Background(), ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}})
	if err != nil {
		t.Fatalf("Chat err: %v", err)
	}
	if msg.Content != "hi" {
		t.Fatalf("msg %q", msg.Content)
	}
}

func TestLLM_ErrorKindAndHelpers(t *testing.T) {
	kinds := []ErrorKind{
		ErrorKindUnknown,
		ErrorKindAuth,
		ErrorKindRateLimit,
		ErrorKindServer,
		ErrorKindValidation,
		ErrorKindNetwork,
		ErrorKindStream,
	}
	for _, k := range kinds {
		if k.String() == "" {
			t.Errorf("expected non-empty String() for ErrorKind %d", k)
		}
	}

	c := NewClient("sk-123", "deepseek-v4-pro")
	if c.ModelName() != "deepseek-v4-pro" {
		t.Errorf("expected ModelName 'deepseek-v4-pro', got %q", c.ModelName())
	}
}

func TestSSE_UsageAndMalformedChunks(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		chunks := []string{
			`data: not-a-json-object`, // malformed, should be skipped
			`data: {"choices":[]}`,    // empty choices, should be skipped
			`data: {"usage":{"prompt_tokens":15,"completion_tokens":25,"total_tokens":40}}`,
			`data: {"choices":[{"delta":{"content":"Response with usage."}}]}`,
			`data: [DONE]`,
		}
		for _, c := range chunks {
			w.Write([]byte(c + "\n"))
			w.(http.Flusher).Flush()
		}
	}))
	defer srv.Close()

	c := &Client{APIKey: "sk-test", BaseURL: srv.URL, HTTPClient: srv.Client()}
	var lastUsage *Usage
	msg, err := c.StreamChat(context.Background(), ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}}, func(d Delta) error {
		if d.Usage != nil {
			lastUsage = d.Usage
		}
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat failed: %v", err)
	}
	if msg.Content != "Response with usage." {
		t.Errorf("expected 'Response with usage.', got %q", msg.Content)
	}
	if lastUsage == nil || lastUsage.TotalTokens != 40 {
		t.Errorf("expected usage TotalTokens == 40, got %+v", lastUsage)
	}
}

