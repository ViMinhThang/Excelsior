package llm

import (
	"context"
	"encoding/json"
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
	if _, err := c.StreamChat(context.Background(), ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}}, nil); err == nil || !strings.Contains(err.Error(), "APIKey") {
		t.Fatalf("expected APIKey error, got %v", err)
	}
}

func TestResolveModel_Alias(t *testing.T) {
	if got := resolveModel("deepseek-v4-pro"); got != "deepseek-reasoner" {
		t.Fatalf("alias v4-pro %q", got)
	}
	if !IsReasoner("deepseek-v4-pro") {
		t.Fatal("expected v4-pro to be reasoner")
	}
	if !IsReasoner("deepseek-reasoner") {
		t.Fatal("expected reasoner")
	}
	if IsReasoner("deepseek-v4-flash") {
		t.Fatal("v4-flash should not be reasoner")
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
