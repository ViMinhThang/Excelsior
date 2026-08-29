package challenge_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/engine"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
)

// =============================================================================
// CHALLENGE 1: session.MemoryStore Adversarial Stress & Deep-Copy Testing
// =============================================================================

// TestChallenge_MemoryStore_Concurrency50 verifies thread-safety under heavy concurrent load.
func TestChallenge_MemoryStore_Concurrency50(t *testing.T) {
	store := session.NewMemoryStore()
	var wg sync.WaitGroup
	numWorkers := 50
	opsPerWorker := 40

	var saveCount, loadCount, listCount, deleteCount, latestCount int64

	for i := 0; i < numWorkers; i++ {
		wg.Add(5)
		workerID := i

		// Worker 1: Save
		go func(id int) {
			defer wg.Done()
			for j := 0; j < opsPerWorker; j++ {
				sessID := fmt.Sprintf("concurrent-sess-%d", (id*7+j)%15)
				err := store.Save(session.Record{
					ID:    sessID,
					Title: fmt.Sprintf("Title %d-%d", id, j),
					Messages: []llm.Message{
						{Role: "user", Content: fmt.Sprintf("User msg %d-%d", id, j)},
						{Role: "assistant", Content: fmt.Sprintf("Asst msg %d-%d", id, j)},
					},
				})
				if err != nil {
					t.Errorf("Save failed: %v", err)
				}
				atomic.AddInt64(&saveCount, 1)
			}
		}(workerID)

		// Worker 2: Load
		go func(id int) {
			defer wg.Done()
			for j := 0; j < opsPerWorker; j++ {
				sessID := fmt.Sprintf("concurrent-sess-%d", (id*7+j)%15)
				rec, err := store.Load(sessID)
				if err != nil && !errors.Is(err, session.ErrSessionNotFound) {
					t.Errorf("Load unexpected error: %v", err)
				}
				if err == nil && rec.ID != sessID {
					t.Errorf("Load mismatch: expected %s, got %s", sessID, rec.ID)
				}
				atomic.AddInt64(&loadCount, 1)
			}
		}(workerID)

		// Worker 3: List
		go func(id int) {
			defer wg.Done()
			for j := 0; j < opsPerWorker; j++ {
				metas, err := store.List()
				if err != nil {
					t.Errorf("List failed: %v", err)
				}
				// Verify list sorting (descending by UpdatedAt)
				for k := 1; k < len(metas); k++ {
					if metas[k].UpdatedAt.After(metas[k-1].UpdatedAt) {
						t.Errorf("List not sorted descending at index %d", k)
					}
				}
				atomic.AddInt64(&listCount, 1)
			}
		}(workerID)

		// Worker 4: Delete
		go func(id int) {
			defer wg.Done()
			for j := 0; j < opsPerWorker; j++ {
				sessID := fmt.Sprintf("concurrent-sess-%d", (id*7+j)%15)
				if j%4 == 0 {
					err := store.Delete(sessID)
					if err != nil {
						t.Errorf("Delete failed: %v", err)
					}
					atomic.AddInt64(&deleteCount, 1)
				}
			}
		}(workerID)

		// Worker 5: Latest
		go func(id int) {
			defer wg.Done()
			for j := 0; j < opsPerWorker; j++ {
				_, err := store.Latest()
				if err != nil && !errors.Is(err, session.ErrSessionNotFound) {
					t.Errorf("Latest unexpected error: %v", err)
				}
				atomic.AddInt64(&latestCount, 1)
			}
		}(workerID)
	}

	wg.Wait()

	t.Logf("Concurrency test completed: Saves=%d, Loads=%d, Lists=%d, Deletes=%d, Latests=%d",
		saveCount, loadCount, listCount, deleteCount, latestCount)
}

// TestChallenge_MemoryStore_DeepCopyMutation tests that mutating records outside the store
// cannot corrupt the store's internal state.
func TestChallenge_MemoryStore_DeepCopyMutation(t *testing.T) {
	store := session.NewMemoryStore()

	initialMsgs := []llm.Message{
		{
			Role:    "user",
			Content: "original user message",
		},
		{
			Role:             "assistant",
			Content:          "original assistant response",
			ReasoningContent: "original reasoning",
		},
	}

	rec := session.Record{
		ID:       "deepcopy-target",
		Title:    "Original Title",
		Messages: initialMsgs,
	}

	if err := store.Save(rec); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// 1. Mutate the input slice and struct after Save
	initialMsgs[0].Content = "MUTATED CONTENT AFTER SAVE"
	initialMsgs[0].Role = "system"
	initialMsgs = append(initialMsgs, llm.Message{Role: "user", Content: "APPENDED AFTER SAVE"})
	rec.Title = "MUTATED TITLE AFTER SAVE"

	// 2. Load from store and verify it was not affected
	loaded1, err := store.Load("deepcopy-target")
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if loaded1.Title != "Original Title" {
		t.Errorf("Title corrupted by post-save mutation: got %q, want 'Original Title'", loaded1.Title)
	}
	if len(loaded1.Messages) != 2 {
		t.Fatalf("Message count corrupted by post-save slice append: got %d, want 2", len(loaded1.Messages))
	}
	if loaded1.Messages[0].Content != "original user message" {
		t.Errorf("Message[0].Content corrupted by post-save mutation: got %q", loaded1.Messages[0].Content)
	}
	if loaded1.Messages[0].Role != "user" {
		t.Errorf("Message[0].Role corrupted by post-save mutation: got %q", loaded1.Messages[0].Role)
	}

	// 3. Mutate the loaded record
	loaded1.Title = "MUTATED LOADED TITLE"
	loaded1.Messages[0].Content = "MUTATED LOADED CONTENT"
	loaded1.Messages[1].ReasoningContent = "MUTATED REASONING"
	loaded1.Messages = append(loaded1.Messages, llm.Message{Role: "user", Content: "APPENDED TO LOADED"})

	// 4. Load again and verify it was not affected by mutation of previous Load result
	loaded2, err := store.Load("deepcopy-target")
	if err != nil {
		t.Fatalf("Second Load failed: %v", err)
	}

	if loaded2.Title != "Original Title" {
		t.Errorf("Title corrupted by post-load mutation: got %q", loaded2.Title)
	}
	if len(loaded2.Messages) != 2 {
		t.Fatalf("Message count corrupted by post-load slice append: got %d", len(loaded2.Messages))
	}
	if loaded2.Messages[0].Content != "original user message" {
		t.Errorf("Message[0].Content corrupted by post-load mutation: got %q", loaded2.Messages[0].Content)
	}
	if loaded2.Messages[1].ReasoningContent != "original reasoning" {
		t.Errorf("Message[1].ReasoningContent corrupted by post-load mutation: got %q", loaded2.Messages[1].ReasoningContent)
	}

	// 5. Test Latest() deep copy
	latestRec, err := store.Latest()
	if err != nil {
		t.Fatalf("Latest failed: %v", err)
	}
	latestRec.Messages[0].Content = "MUTATED LATEST CONTENT"
	latestRec.Messages = nil

	loaded3, err := store.Load("deepcopy-target")
	if err != nil {
		t.Fatalf("Third Load failed: %v", err)
	}
	if len(loaded3.Messages) != 2 || loaded3.Messages[0].Content != "original user message" {
		t.Errorf("Latest mutation corrupted stored record: len=%d, content=%q",
			len(loaded3.Messages), loaded3.Messages[0].Content)
	}
}

// TestChallenge_MemoryStore_ToolCallsDeepCopyMutation stress tests nested slice mutation
// (ToolCalls inside llm.Message) to verify whether internal store memory is isolated.
func TestChallenge_MemoryStore_ToolCallsDeepCopyMutation(t *testing.T) {
	store := session.NewMemoryStore()

	origToolCalls := []llm.ToolCall{
		{
			ID:   "call_orig_1",
			Type: "function",
			Function: llm.FuncCall{
				Name:      "bash",
				Arguments: `{"command":"git status"}`,
			},
		},
	}

	rec := session.Record{
		ID:    "toolcall-isolation-target",
		Title: "Tool Call Session",
		Messages: []llm.Message{
			{
				Role:      "assistant",
				Content:   "Running bash command",
				ToolCalls: origToolCalls,
			},
		},
	}

	if err := store.Save(rec); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// 1. Mutate original slice backing array in-place
	origToolCalls[0].Function.Name = "MUTATED_ORIGINAL_TOOL_NAME"
	origToolCalls[0].Function.Arguments = "MUTATED_ORIGINAL_ARGS"

	loaded1, err := store.Load("toolcall-isolation-target")
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if loaded1.Messages[0].ToolCalls[0].Function.Name != "bash" {
		t.Logf("DISCOVERY: MemoryStore does shallow-copy on Message.ToolCalls slice: got %q, want 'bash'",
			loaded1.Messages[0].ToolCalls[0].Function.Name)
	} else {
		t.Logf("MemoryStore cleanly isolated ToolCalls slice against pre-save mutation")
	}

	// 2. Mutate loaded1's ToolCalls
	loaded1.Messages[0].ToolCalls[0].Function.Name = "MUTATED_LOADED_TOOL_NAME"

	loaded2, err := store.Load("toolcall-isolation-target")
	if err != nil {
		t.Fatalf("Second Load failed: %v", err)
	}

	if loaded2.Messages[0].ToolCalls[0].Function.Name != "bash" {
		t.Logf("DISCOVERY: Modifying loaded record's ToolCalls mutated internal store state: got %q, want 'bash'",
			loaded2.Messages[0].ToolCalls[0].Function.Name)
	} else {
		t.Logf("MemoryStore cleanly isolated ToolCalls slice against post-load mutation")
	}
}

// TestChallenge_MemoryStore_EdgeCases tests edge cases: empty store, deleting non-existent, invalid IDs.
func TestChallenge_MemoryStore_EdgeCases(t *testing.T) {
	store := session.NewMemoryStore()

	// 1. Empty Store Listings
	metas, err := store.List()
	if err != nil {
		t.Fatalf("List on empty store returned error: %v", err)
	}
	if metas == nil {
		t.Error("List on empty store returned nil slice, expected non-nil empty slice")
	}
	if len(metas) != 0 {
		t.Errorf("List on empty store returned %d items, expected 0", len(metas))
	}

	// 2. Latest on empty store must return ErrSessionNotFound
	_, err = store.Latest()
	if err == nil || !errors.Is(err, session.ErrSessionNotFound) {
		t.Fatalf("Latest on empty store: expected ErrSessionNotFound, got %v", err)
	}

	// 3. Load non-existent key must return ErrSessionNotFound
	_, err = store.Load("non-existent-session-id")
	if err == nil || !errors.Is(err, session.ErrSessionNotFound) {
		t.Fatalf("Load non-existent: expected ErrSessionNotFound, got %v", err)
	}

	// 4. Delete non-existent key must succeed (idempotent, no error)
	err = store.Delete("never-existed-id")
	if err != nil {
		t.Fatalf("Delete non-existent key failed: %v", err)
	}

	// 5. Deleting with invalid ID (traversal) should return ErrInvalidSessionID
	err = store.Delete("../../etc/passwd")
	if err == nil || !errors.Is(err, session.ErrInvalidSessionID) {
		t.Fatalf("Delete traversal ID: expected ErrInvalidSessionID, got %v", err)
	}

	// 6. Saving with empty ID should return error
	err = store.Save(session.Record{ID: ""})
	if err == nil {
		t.Fatal("Save with empty ID expected error, got nil")
	}
	if !errors.Is(err, session.ErrEmptySessionID) && !errors.Is(err, session.ErrInvalidSessionID) {
		t.Fatalf("Save empty ID: expected ErrEmptySessionID or ErrInvalidSessionID, got %v", err)
	}

	// 7. Loading with invalid ID should return ErrInvalidSessionID
	_, err = store.Load("bad/id/with/slashes")
	if err == nil || !errors.Is(err, session.ErrInvalidSessionID) {
		t.Fatalf("Load with slashes: expected ErrInvalidSessionID, got %v", err)
	}
}

// =============================================================================
// CHALLENGE 2: engine.AgentFactory & Runner Injection Stress Testing
// =============================================================================

type failingRunner struct {
	failErr error
}

func (r *failingRunner) RunWithHistory(ctx context.Context, opts agent.RunOptions) (*agent.RunResult, error) {
	return nil, r.failErr
}

type cancelingRunner struct {
	cancelAfter time.Duration
}

func (r *cancelingRunner) RunWithHistory(ctx context.Context, opts agent.RunOptions) (*agent.RunResult, error) {
	select {
	case <-time.After(r.cancelAfter):
		return nil, context.Canceled
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

type syntheticStreamRunner struct {
	deltaCount int
	chunkSize  int
}

func (r *syntheticStreamRunner) RunWithHistory(ctx context.Context, opts agent.RunOptions) (*agent.RunResult, error) {
	if opts.OnEvent != nil {
		opts.OnEvent(agent.StreamEvent{Type: "reasoning", Reasoning: "Initiating synthetic stream burst..."})
		for i := 0; i < r.deltaCount; i++ {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			chunk := strings.Repeat(fmt.Sprintf("[%d]", i), r.chunkSize)
			opts.OnEvent(agent.StreamEvent{
				Type: "text",
				Text: chunk,
			})
		}
		opts.OnEvent(agent.StreamEvent{
			Type:         "done",
			Text:         "Stream completed successfully",
			FinishReason: "stop",
		})
	}
	finalMsg := &llm.Message{
		Role:             "assistant",
		Content:          "Stream completed successfully",
		ReasoningContent: "Initiating synthetic stream burst...",
	}
	return &agent.RunResult{
		FinalMessage: finalMsg,
		Messages:     append(opts.Messages, *finalMsg),
	}, nil
}

type testInjectableFactory struct {
	createFn func(model, workspace string) (agent.Runner, error)
}

func (f *testInjectableFactory) NewAgent(model, workspace string) (agent.Runner, error) {
	if f.createFn != nil {
		return f.createFn(model, workspace)
	}
	return nil, fmt.Errorf("no factory createFn configured")
}

// TestChallenge_Engine_AgentFailureInjection verifies that agent failures are properly translated
// to TypeError WebSocket envelopes and the connection remains unblocked for future requests.
func TestChallenge_Engine_AgentFailureInjection(t *testing.T) {
	memStore := session.NewMemoryStore()
	expectedErr := errors.New("simulated critical LLM network failure")

	factory := &testInjectableFactory{
		createFn: func(model, workspace string) (agent.Runner, error) {
			return &failingRunner{failErr: expectedErr}, nil
		},
	}

	hub := engine.NewHub(config.Config{Model: "deepseek-v4-flash"}, "/test/ws")
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	hub.AgentFactory = factory
	hub.SessionStore = memStore

	srv := httptest.NewServer(hub.Handler())
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer ws.Close()

	// 1. Send chat request that will trigger failure
	chatReq := protocol.ChatReq{
		SessionID: "failure-sess-1",
		Model:     "deepseek-v4-flash",
		Messages:  []llm.Message{{Role: "user", Content: "Trigger failure"}},
	}
	env := protocol.NewEnvelopeWithID("req-fail-1", protocol.TypeChatReq, chatReq)
	b, _ := json.Marshal(env)
	if err := ws.WriteMessage(websocket.TextMessage, b); err != nil {
		t.Fatalf("Write chat.req failed: %v", err)
	}

	// 2. Read error envelope
	_ = ws.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, respData, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("Read response failed: %v", err)
	}

	var respEnv protocol.Envelope
	if err := json.Unmarshal(respData, &respEnv); err != nil {
		t.Fatalf("Unmarshal error response envelope failed: %v", err)
	}

	if respEnv.Type != protocol.TypeError {
		t.Fatalf("Expected envelope Type=%q, got %q", protocol.TypeError, respEnv.Type)
	}
	if respEnv.ID != "req-fail-1" {
		t.Errorf("Expected response ID 'req-fail-1', got %q", respEnv.ID)
	}

	// 3. Verify connection is NOT stuck in "already streaming" — send another request
	// Switch factory to successful runner
	factory.createFn = func(model, workspace string) (agent.Runner, error) {
		return &syntheticStreamRunner{deltaCount: 2, chunkSize: 1}, nil
	}

	env2 := protocol.NewEnvelopeWithID("req-succ-2", protocol.TypeChatReq, chatReq)
	b2, _ := json.Marshal(env2)
	if err := ws.WriteMessage(websocket.TextMessage, b2); err != nil {
		t.Fatalf("Write second chat.req failed: %v", err)
	}

	// Read until done envelope
	var gotDone bool
	for i := 0; i < 5; i++ {
		_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, data, err := ws.ReadMessage()
		if err != nil {
			break
		}
		var e protocol.Envelope
		_ = json.Unmarshal(data, &e)
		if e.Type == protocol.TypeDone {
			gotDone = true
			break
		}
	}

	if !gotDone {
		t.Error("Expected successful completion on second request after prior failure")
	}
}

// TestChallenge_Engine_FactoryCreationError verifies that when NewAgent returns an error,
// the engine sends a TypeError with the creation error message.
func TestChallenge_Engine_FactoryCreationError(t *testing.T) {
	hub := engine.NewHub(config.Config{Model: "deepseek-v4-flash"}, "/test/ws")
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	hub.AgentFactory = &testInjectableFactory{
		createFn: func(model, workspace string) (agent.Runner, error) {
			return nil, fmt.Errorf("model %q is not authorized for workspace %q", model, workspace)
		},
	}
	hub.SessionStore = session.NewMemoryStore()

	srv := httptest.NewServer(hub.Handler())
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Dial failed: %v", err)
	}
	defer ws.Close()

	env := protocol.NewEnvelopeWithID("req-factory-err", protocol.TypeChatReq, protocol.ChatReq{
		Model:    "unauthorized-model",
		Messages: []llm.Message{{Role: "user", Content: "Hello"}},
	})
	b, _ := json.Marshal(env)
	_ = ws.WriteMessage(websocket.TextMessage, b)

	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("Read error envelope failed: %v", err)
	}

	var resp protocol.Envelope
	_ = json.Unmarshal(data, &resp)
	if resp.Type != protocol.TypeError {
		t.Fatalf("Expected TypeError, got %q", resp.Type)
	}
	if !strings.Contains(string(resp.Payload), "create agent:") {
		t.Errorf("Expected payload to mention create agent error, got %s", string(resp.Payload))
	}
}

// TestChallenge_Engine_ContextCancellationAndDisconnection tests engine stability
// when client closes connection midway during agent streaming.
func TestChallenge_Engine_ContextCancellationAndDisconnection(t *testing.T) {
	memStore := session.NewMemoryStore()

	factory := &testInjectableFactory{
		createFn: func(model, workspace string) (agent.Runner, error) {
			return &cancelingRunner{cancelAfter: 50 * time.Millisecond}, nil
		},
	}

	hub := engine.NewHub(config.Config{Model: "deepseek-v4-flash"}, "/test/ws")
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	hub.AgentFactory = factory
	hub.SessionStore = memStore

	srv := httptest.NewServer(hub.Handler())
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Dial failed: %v", err)
	}

	env := protocol.NewEnvelopeWithID("req-cancel-1", protocol.TypeChatReq, protocol.ChatReq{
		SessionID: "sess-cancel",
		Messages:  []llm.Message{{Role: "user", Content: "Cancel me"}},
	})
	b, _ := json.Marshal(env)
	_ = ws.WriteMessage(websocket.TextMessage, b)

	// Read error envelope from context cancellation
	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("Read failed: %v", err)
	}
	var resp protocol.Envelope
	_ = json.Unmarshal(data, &resp)
	if resp.Type != protocol.TypeError {
		t.Errorf("Expected TypeError on cancellation, got %s", resp.Type)
	}

	// Now test immediate client disconnect while runner is active
	factory.createFn = func(model, workspace string) (agent.Runner, error) {
		return &syntheticStreamRunner{deltaCount: 50, chunkSize: 10}, nil
	}

	ws2, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Dial 2 failed: %v", err)
	}

	env2 := protocol.NewEnvelopeWithID("req-disconnect", protocol.TypeChatReq, protocol.ChatReq{
		SessionID: "sess-disconn",
		Messages:  []llm.Message{{Role: "user", Content: "Disconnect test"}},
	})
	b2, _ := json.Marshal(env2)
	_ = ws2.WriteMessage(websocket.TextMessage, b2)

	// Close WS immediately without waiting for stream completion
	time.Sleep(5 * time.Millisecond)
	_ = ws2.Close()

	// Hub should cleanly unregister and not panic
	time.Sleep(50 * time.Millisecond)
}

// TestChallenge_Engine_SyntheticDeltaStreamHighThroughput tests synthetic delta streams
// verifying envelope ordering, reasoning deltas, text deltas, and done envelopes.
func TestChallenge_Engine_SyntheticDeltaStreamHighThroughput(t *testing.T) {
	memStore := session.NewMemoryStore()
	numDeltas := 20

	factory := &testInjectableFactory{
		createFn: func(model, workspace string) (agent.Runner, error) {
			return &syntheticStreamRunner{deltaCount: numDeltas, chunkSize: 5}, nil
		},
	}

	hub := engine.NewHub(config.Config{Model: "deepseek-v4-flash"}, "/test/ws")
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	hub.AgentFactory = factory
	hub.SessionStore = memStore

	srv := httptest.NewServer(hub.Handler())
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Dial failed: %v", err)
	}
	defer ws.Close()

	sessionID := "synthetic-stream-sess-1"
	chatReq := protocol.ChatReq{
		SessionID: sessionID,
		Model:     "deepseek-v4-flash",
		Messages:  []llm.Message{{Role: "user", Content: "Generate stream"}},
	}
	env := protocol.NewEnvelopeWithID("stream-req-1", protocol.TypeChatReq, chatReq)
	b, _ := json.Marshal(env)
	if err := ws.WriteMessage(websocket.TextMessage, b); err != nil {
		t.Fatalf("Write chat.req failed: %v", err)
	}

	var reasoningCount, textCount int
	var doneReceived bool

	for {
		_ = ws.SetReadDeadline(time.Now().Add(3 * time.Second))
		_, data, err := ws.ReadMessage()
		if err != nil {
			break
		}

		var inEnv protocol.Envelope
		if err := json.Unmarshal(data, &inEnv); err != nil {
			t.Fatalf("Unmarshal envelope error: %v", err)
		}

		switch inEnv.Type {
		case protocol.TypeDelta:
			var d protocol.Delta
			_ = inEnv.Decode(&d)
			if d.Type == "reasoning" {
				reasoningCount++
			} else if d.Type == "text" {
				textCount++
			}
		case protocol.TypeDone:
			doneReceived = true
			goto StreamComplete
		case protocol.TypeError:
			t.Fatalf("Received unexpected TypeError: %s", string(inEnv.Payload))
		}
	}

StreamComplete:
	if !doneReceived {
		t.Fatal("Stream finished without receiving TypeDone envelope")
	}
	if reasoningCount != 1 {
		t.Errorf("Expected 1 reasoning delta, got %d", reasoningCount)
	}
	if textCount != numDeltas {
		t.Errorf("Expected %d text deltas, got %d", numDeltas, textCount)
	}

	// Verify session was saved into MemoryStore
	rec, err := memStore.Load(sessionID)
	if err != nil {
		t.Fatalf("Failed to load session from MemoryStore: %v", err)
	}
	if len(rec.Messages) != 2 {
		t.Fatalf("Expected 2 saved messages (user + assistant), got %d", len(rec.Messages))
	}
	if rec.Messages[1].Role != "assistant" || rec.Messages[1].Content != "Stream completed successfully" {
		t.Errorf("Saved assistant message unexpected: %+v", rec.Messages[1])
	}
}
