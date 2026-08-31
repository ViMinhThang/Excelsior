package engine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
	"excelsior/pkg/tools"
)

func TestHub_WorkspaceConcurrency(t *testing.T) {
	cfg := config.Config{Model: "deepseek-v4-flash"}
	hub := NewHub(cfg, "/initial/workspace")

	if hub.Workspace() != "/initial/workspace" {
		t.Fatalf("expected /initial/workspace, got %s", hub.Workspace())
	}

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(2)
		go func(idx int) {
			defer wg.Done()
			hub.SetWorkspace(fmt.Sprintf("/workspace/%d", idx))
		}(i)
		go func() {
			defer wg.Done()
			_ = hub.Workspace()
		}()
	}
	wg.Wait()

	if hub.Workspace() == "" {
		t.Fatal("workspace should not be empty after concurrent updates")
	}
}

func TestHub_HealthEndpoint(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	srv := httptest.NewServer(hub.Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("health check GET failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "ok" {
		t.Errorf("expected body 'ok', got %q", string(body))
	}
}

func TestHub_WebSocketSessionLifecycle(t *testing.T) {
	wsDir := t.TempDir()
	cfg := config.Config{Model: "deepseek-v4-flash"}
	hub := NewHub(cfg, wsDir)
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))

	srv := httptest.NewServer(hub.Handler())
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("websocket dial failed: %v", err)
	}
	defer ws.Close()

	// Helper to send envelope
	send := func(env protocol.Envelope) {
		b, _ := json.Marshal(env)
		if err := ws.WriteMessage(websocket.TextMessage, b); err != nil {
			t.Fatalf("ws write failed: %v", err)
		}
	}

	// Helper to read envelope
	read := func() protocol.Envelope {
		_ = ws.SetReadDeadline(time.Now().Add(5 * time.Second))
		_, data, err := ws.ReadMessage()
		if err != nil {
			t.Fatalf("ws read failed: %v", err)
		}
		var env protocol.Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			t.Fatalf("unmarshal envelope failed: %v", err)
		}
		return env
	}

	// 1. Ping / Pong
	send(protocol.Envelope{Ver: protocol.Ver, Type: protocol.TypePing})
	pong := read()
	if pong.Type != protocol.TypePong {
		t.Errorf("expected pong, got %s", pong.Type)
	}

	// 2. session.create with title
	send(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      "req-1",
		Type:    protocol.TypeSessionCreate,
		Payload: protocol.MustMarshalPayload(protocol.SessionCreateReq{Title: "Refactoring Plan"}),
	})
	createdEnv := read()
	if createdEnv.Type != protocol.TypeSessionCreate {
		t.Fatalf("expected session.create response, got %s", createdEnv.Type)
	}
	var createResp protocol.SessionCreateResp
	_ = createdEnv.Decode(&createResp)
	sessionID := createResp.ID
	if sessionID == "" {
		t.Fatal("expected non-empty session ID")
	}

	// 3. session.list -> check title
	send(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      "req-2",
		Type:    protocol.TypeSessionList,
		Payload: protocol.MustMarshalPayload(protocol.SessionListReq{}),
	})
	listEnv := read()
	if listEnv.Type != protocol.TypeSessionList {
		t.Fatalf("expected session.list response, got %s", listEnv.Type)
	}
	var listResp protocol.SessionListResp
	_ = listEnv.Decode(&listResp)
	if len(listResp.Sessions) != 1 || listResp.Sessions[0].Title != "Refactoring Plan" {
		t.Fatalf("session.list unexpected: %+v", listResp.Sessions)
	}

	// 4. session.rename -> rename and check persistence
	send(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      "req-3",
		Type:    protocol.TypeSessionRename,
		Payload: protocol.MustMarshalPayload(protocol.SessionRenameReq{ID: sessionID, Title: "Final Architectural Blueprint"}),
	})
	renameEnv := read()
	if renameEnv.Type != protocol.TypeSessionRename {
		t.Fatalf("expected session.rename response, got %s", renameEnv.Type)
	}

	// Verify title was updated in list
	send(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      "req-4",
		Type:    protocol.TypeSessionList,
		Payload: protocol.MustMarshalPayload(protocol.SessionListReq{}),
	})
	listEnv2 := read()
	var listResp2 protocol.SessionListResp
	_ = listEnv2.Decode(&listResp2)
	if len(listResp2.Sessions) != 1 || listResp2.Sessions[0].Title != "Final Architectural Blueprint" {
		t.Fatalf("session title after rename not updated: %+v", listResp2.Sessions)
	}

	// 5. session.data
	send(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      "req-5",
		Type:    protocol.TypeSessionData,
		Payload: protocol.MustMarshalPayload(protocol.SessionDataReq{ID: sessionID}),
	})
	dataEnv := read()
	if dataEnv.Type != protocol.TypeSessionData {
		t.Fatalf("expected session.data response, got %s", dataEnv.Type)
	}

	// 6. session.delete
	send(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      "req-6",
		Type:    protocol.TypeSessionDelete,
		Payload: protocol.MustMarshalPayload(protocol.SessionDeleteReq{ID: sessionID}),
	})
	delEnv := read()
	if delEnv.Type != protocol.TypeSessionDelete {
		t.Fatalf("expected session.delete response, got %s", delEnv.Type)
	}

	// 7. workspace.set
	newWS := filepath.Join(wsDir, "alt_workspace")
	send(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      "req-7",
		Type:    protocol.TypeWorkspaceSet,
		Payload: protocol.MustMarshalPayload(protocol.WorkspaceSetReq{Workspace: newWS}),
	})
	wsListEnv := read()
	if wsListEnv.Type != protocol.TypeSessionList {
		t.Fatalf("expected session.list response after workspace.set, got %s", wsListEnv.Type)
	}
	// workspace.set now only affects conn, not hub globally (per-conn isolation)
	_ = wsListEnv
}

func TestConn_AskCorrelation(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	c := newConn(hub, nil)

	askCh := make(chan protocol.AskResp, 1)
	c.setAskChannel(askCh)

	ch, ok := c.getAskChannel()
	if !ok || ch == nil {
		t.Fatal("expected ask channel to be registered")
	}

	// Dispatch Ask response
	env := protocol.Envelope{
		Ver:     protocol.Ver,
		Type:    protocol.TypeAskResp,
		Payload: protocol.MustMarshalPayload(protocol.AskResp{Selected: 2, Answer: "Option C", Label: "Label C"}),
	}
	c.handleAskResp(env)

	select {
	case resp := <-ch:
		if resp.Selected != 2 || resp.Answer != "Option C" {
			t.Fatalf("unexpected ask response: %+v", resp)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for correlated ask response")
	}

	c.clearAskChannel()
	if _, ok := c.getAskChannel(); ok {
		t.Fatal("expected ask channel to be cleared")
	}
}

func TestSessionInfo_Fallback(t *testing.T) {
	// Custom title preferred
	info := sessionInfo([]llm.Message{{Role: "user", Content: "First msg"}}, "My Custom Title")
	if info.Title != "My Custom Title" {
		t.Errorf("expected custom title, got %q", info.Title)
	}

	// Fallback to first user message
	info2 := sessionInfo([]llm.Message{
		{Role: "system", Content: "System prompt"},
		{Role: "user", Content: "Refactor engine packages"},
		{Role: "assistant", Content: "Done"},
	}, "")
	if info2.Title != "Refactor engine packages" {
		t.Errorf("expected first user message title, got %q", info2.Title)
	}

	// Truncated long user message
	longMsg := strings.Repeat("A", 60)
	info3 := sessionInfo([]llm.Message{{Role: "user", Content: longMsg}}, "")
	if len(info3.Title) != 43 || !strings.HasSuffix(info3.Title, "…") { // 40 chars + "…" (3 bytes in UTF-8)
		t.Errorf("expected truncated title with ellipsis, got %q (len %d)", info3.Title, len(info3.Title))
	}
}

func TestEngine_AskHandlerEmptyOptionsGuard(t *testing.T) {
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer ws.Close()

		// Read chat.req
		_, _, _ = ws.ReadMessage()

		// Send ask.req with empty options
		askEnv := protocol.NewEnvelope(protocol.TypeAskReq, protocol.AskReq{
			Question: "What is your preference?",
			Options:  nil, // Empty options!
		})
		b, _ := json.Marshal(askEnv)
		_ = ws.WriteMessage(websocket.TextMessage, b)

		// Read ask.resp
		_, respData, _ := ws.ReadMessage()
		var inEnv protocol.Envelope
		_ = json.Unmarshal(respData, &inEnv)
		var askResp protocol.AskResp
		_ = inEnv.Decode(&askResp)

		if askResp.Selected != -1 {
			t.Errorf("expected Selected == -1 on empty options, got %d", askResp.Selected)
		}

		// Finish
		doneEnv := protocol.NewEnvelope(protocol.TypeDone, nil)
		bDone, _ := json.Marshal(doneEnv)
		_ = ws.WriteMessage(websocket.TextMessage, bDone)
	}))
	defer srv.Close()

	client := &WSClient{URL: srv.URL}
	err := client.StreamRemote(context.Background(), protocol.ChatReq{Model: "deepseek-v4-flash"}, nil, nil, nil)
	if err != nil {
		t.Fatalf("StreamRemote failed: %v", err)
	}
}

func TestEngine_TypedEngineErrorInspection(t *testing.T) {
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer ws.Close()

		// Read chat.req
		_, _, _ = ws.ReadMessage()

		// Send TypeError envelope
		errEnv := protocol.NewEnvelope(protocol.TypeError, map[string]string{"error": "engine internal failure"})
		b, _ := json.Marshal(errEnv)
		_ = ws.WriteMessage(websocket.TextMessage, b)
	}))
	defer srv.Close()

	client := &WSClient{URL: srv.URL}
	err := client.StreamRemote(context.Background(), protocol.ChatReq{Model: "deepseek-v4-flash"}, nil, nil, nil)
	if err == nil {
		t.Fatal("expected error from StreamRemote on TypeError")
	}
	if !errors.Is(err, ErrRemoteEngine) {
		t.Fatalf("expected errors.Is(err, ErrRemoteEngine), got %v", err)
	}
	var engineErr *EngineError
	if !errors.As(err, &engineErr) {
		t.Fatalf("expected *EngineError, got %v", err)
	}
	if engineErr.Op != "chat" {
		t.Errorf("expected Op 'chat', got %q", engineErr.Op)
	}

	// Invalid URL check
	clientBad := &WSClient{URL: "://invalid-url"}
	errBad := clientBad.StreamRemote(context.Background(), protocol.ChatReq{Model: "deepseek-v4-flash"}, nil, nil, nil)
	if errBad == nil || !errors.Is(errBad, ErrInvalidURL) {
		t.Fatalf("expected ErrInvalidURL, got %v", errBad)
	}
}

type mockRunner struct {
	events   []agent.StreamEvent
	finalMsg *llm.Message
}

func (m *mockRunner) RunWithHistory(ctx context.Context, opts agent.RunOptions) (*agent.RunResult, error) {
	for _, ev := range m.events {
		if opts.OnEvent != nil {
			opts.OnEvent(ev)
		}
	}
	msgs := append(opts.Messages, *m.finalMsg)
	return &agent.RunResult{
		FinalMessage: m.finalMsg,
		Messages:     msgs,
	}, nil
}

type mockFactory struct {
	runner agent.Runner
}

func (f *mockFactory) NewAgent(model, workspace string) (agent.Runner, error) {
	return f.runner, nil
}

func TestHub_MockAgentFactory(t *testing.T) {
	memStore := session.NewMemoryStore()
	runner := &mockRunner{
		events: []agent.StreamEvent{
			{Type: "reasoning", Reasoning: "thinking..."},
			{Type: "text", Text: "Hello from mock agent!"},
		},
		finalMsg: &llm.Message{
			Role:             "assistant",
			Content:          "Hello from mock agent!",
			ReasoningContent: "thinking...",
		},
	}

	hub := NewHub(config.Config{Model: "deepseek-v4-flash"}, "/test/ws")
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	hub.AgentFactory = &mockFactory{runner: runner}
	hub.SessionStore = memStore

	srv := httptest.NewServer(hub.Handler())
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer ws.Close()

	// Send chat.req
	chatReq := protocol.ChatReq{
		SessionID: "mock-sess-1",
		Model:     "deepseek-v4-flash",
		Messages:  []llm.Message{{Role: "user", Content: "Hello"}},
	}
	env := protocol.NewEnvelope("chat.req", chatReq)
	b, _ := json.Marshal(env)
	if err := ws.WriteMessage(websocket.TextMessage, b); err != nil {
		t.Fatalf("write chat.req failed: %v", err)
	}

	// Expect delta (reasoning), delta (text), done
	var receivedReasoning, receivedText, receivedDone bool
	for i := 0; i < 3; i++ {
		_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, data, err := ws.ReadMessage()
		if err != nil {
			t.Fatalf("read %d failed: %v", i, err)
		}
		var inEnv protocol.Envelope
		if err := json.Unmarshal(data, &inEnv); err != nil {
			t.Fatalf("unmarshal %d failed: %v", i, err)
		}
		if inEnv.Type == protocol.TypeDelta {
			var d protocol.Delta
			_ = inEnv.Decode(&d)
			if d.Type == "reasoning" && d.Reasoning == "thinking..." {
				receivedReasoning = true
			}
			if d.Type == "text" && d.Text == "Hello from mock agent!" {
				receivedText = true
			}
		} else if inEnv.Type == protocol.TypeDone {
			receivedDone = true
		}
	}

	if !receivedReasoning || !receivedText || !receivedDone {
		t.Errorf("missing envelopes: reasoning=%v text=%v done=%v", receivedReasoning, receivedText, receivedDone)
	}

	// Verify persistence in MemoryStore
	rec, err := memStore.Load("mock-sess-1")
	if err != nil {
		t.Fatalf("failed to load saved session from MemoryStore: %v", err)
	}
	if len(rec.Messages) != 2 || rec.Messages[1].Content != "Hello from mock agent!" {
		t.Fatalf("unexpected saved messages: %+v", rec.Messages)
	}
}

func TestHub_MemorySessionStore(t *testing.T) {
	memStore := session.NewMemoryStore()
	hub := NewHub(config.Config{Model: "deepseek-v4-flash"}, "/test/ws")
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	hub.SessionStore = memStore

	srv := httptest.NewServer(hub.Handler())
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer ws.Close()

	// 1. Create session
	createEnv := protocol.NewEnvelopeWithID("c-1", protocol.TypeSessionCreate, protocol.SessionCreateReq{Title: "In-Memory Session"})
	bCreate, _ := json.Marshal(createEnv)
	_ = ws.WriteMessage(websocket.TextMessage, bCreate)

	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, _ := ws.ReadMessage()
	var inCreate protocol.Envelope
	_ = json.Unmarshal(data, &inCreate)
	var respCreate protocol.SessionCreateResp
	_ = inCreate.Decode(&respCreate)
	sessID := respCreate.ID
	if sessID == "" {
		t.Fatal("expected session ID from create")
	}

	// 2. List sessions
	listEnv := protocol.NewEnvelopeWithID("l-1", protocol.TypeSessionList, protocol.SessionListReq{})
	bList, _ := json.Marshal(listEnv)
	_ = ws.WriteMessage(websocket.TextMessage, bList)

	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, _ = ws.ReadMessage()
	var inList protocol.Envelope
	_ = json.Unmarshal(data, &inList)
	var respList protocol.SessionListResp
	_ = inList.Decode(&respList)
	if len(respList.Sessions) != 1 || respList.Sessions[0].Title != "In-Memory Session" {
		t.Fatalf("unexpected list response: %+v", respList.Sessions)
	}

	// 3. Rename session
	renameEnv := protocol.NewEnvelopeWithID("r-1", protocol.TypeSessionRename, protocol.SessionRenameReq{ID: sessID, Title: "Renamed Memory Session"})
	bRename, _ := json.Marshal(renameEnv)
	_ = ws.WriteMessage(websocket.TextMessage, bRename)

	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, _ = ws.ReadMessage()
	var inRename protocol.Envelope
	_ = json.Unmarshal(data, &inRename)
	if inRename.Type != protocol.TypeSessionRename {
		t.Fatalf("expected rename response, got %s", inRename.Type)
	}

	// 4. Delete session
	delEnv := protocol.NewEnvelopeWithID("d-1", protocol.TypeSessionDelete, protocol.SessionDeleteReq{ID: sessID})
	bDel, _ := json.Marshal(delEnv)
	_ = ws.WriteMessage(websocket.TextMessage, bDel)

	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, _ = ws.ReadMessage()
	var inDel protocol.Envelope
	_ = json.Unmarshal(data, &inDel)
	if inDel.Type != protocol.TypeSessionDelete {
		t.Fatalf("expected delete response, got %s", inDel.Type)
	}

	// Verify store is now empty
	metas, _ := memStore.List()
	if len(metas) != 0 {
		t.Fatalf("expected 0 sessions in MemoryStore after delete, got %d", len(metas))
	}
}

func TestEngineError_FormattingAndUnwrap(t *testing.T) {
	ee1 := &EngineError{
		Op:       "dial",
		ClientID: "client-1",
		MsgType:  protocol.TypeChatReq,
		Msg:      "connection timed out",
		Err:      ErrConnectionFailed,
	}
	if !errors.Is(ee1, ErrConnectionFailed) {
		t.Errorf("expected Is(ErrConnectionFailed)")
	}
	if ee1.Unwrap() != ErrConnectionFailed {
		t.Errorf("expected Unwrap() to return ErrConnectionFailed")
	}
	if !strings.Contains(ee1.Error(), "client=client-1") || !strings.Contains(ee1.Error(), "type=chat.req") {
		t.Errorf("expected client and type in error string: %s", ee1.Error())
	}

	sentinels := []error{
		ErrAlreadyStreaming, ErrConnectionClosed, ErrClientDisconnected,
		ErrSendBufferFull, ErrRemoteEngine, ErrInvalidURL, ErrConnectionFailed,
	}
	for _, s := range sentinels {
		ee := &EngineError{Err: s}
		if !errors.Is(ee, s) {
			t.Errorf("expected Is(%v) on EngineError", s)
		}
	}

	eeEmpty := &EngineError{}
	if eeEmpty.Error() != "engine" {
		t.Errorf("expected 'engine', got %q", eeEmpty.Error())
	}
	if eeEmpty.Is(nil) {
		t.Error("Is(nil) should be false")
	}
}

func TestHub_BroadcastAndUnregister(t *testing.T) {
	hub := NewHub(config.Config{Model: "v4"}, "/tmp")
	c1 := newConn(hub, nil)
	c2 := newConn(hub, nil)

	hub.Register(c1)
	hub.Register(c2)

	// Broadcast
	hub.Broadcast(protocol.NewEnvelope(protocol.TypePing, nil))

	select {
	case <-c1.send:
	default:
		t.Error("expected broadcast envelope on c1")
	}

	select {
	case <-c2.send:
	default:
		t.Error("expected broadcast envelope on c2")
	}

	hub.Unregister(c1)
	hub.Unregister(c2)
}

type mockFailingRunner struct{}

func (f *mockFailingRunner) RunWithHistory(ctx context.Context, opts agent.RunOptions) (*agent.RunResult, error) {
	return nil, errors.New("agent execution failed")
}

func TestEngine_HandleChat_ErrorBranch(t *testing.T) {
	hub := NewHub(config.Config{Model: "v4"}, "/tmp")
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	hub.AgentFactory = &mockFactory{runner: &mockFailingRunner{}}
	hub.SessionStore = session.NewMemoryStore()

	conn := newConn(hub, nil)
	env := protocol.NewEnvelopeWithID("err-chat-1", protocol.TypeChatReq, protocol.ChatReq{
		Model:    "v4",
		Messages: []llm.Message{{Role: "user", Content: "Fail please"}},
	})

	conn.handleChat(context.Background(), env)

	select {
	case msg := <-conn.send:
		var resp protocol.Envelope
		_ = json.Unmarshal(msg, &resp)
		if resp.Type != protocol.TypeError || resp.ID != "err-chat-1" {
			t.Errorf("expected TypeError with ID 'err-chat-1', got %+v", resp)
		}
	default:
		t.Fatal("expected error envelope on conn.send")
	}
}

func TestEngine_AskHandler_Cancellation(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	conn := newConn(hub, nil)

	parentCtx, cancelParent := context.WithCancel(context.Background())
	cancelParent()

	askCh := make(chan protocol.AskResp, 1)
	handler := conn.askHandler(parentCtx, askCh)

	_, err := handler(context.Background(), tools.AskRequest{Question: "Choose?"})
	if err == nil {
		t.Fatal("expected error on canceled parentCtx")
	}
}

func TestEngine_DecodePayload_Error(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	conn := newConn(hub, nil)

	badEnv := protocol.Envelope{
		ID:      "bad-1",
		Type:    protocol.TypeSessionData,
		Payload: json.RawMessage(`{invalid-json`),
	}

	conn.handleSessionData(context.Background(), badEnv)
	select {
	case msg := <-conn.send:
		var resp protocol.Envelope
		_ = json.Unmarshal(msg, &resp)
		if resp.Type != protocol.TypeError {
			t.Errorf("expected TypeError on bad payload decode, got %s", resp.Type)
		}
	default:
		t.Fatal("expected error envelope on conn.send")
	}
}




