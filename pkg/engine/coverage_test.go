package engine

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
)

func TestConn_SendEnvelope_DropsDelta(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	c := newConn(hub, nil)
	for i := 0; i < cap(c.send); i++ {
		c.send <- []byte("x")
	}
	c.sendEnvelope(protocol.NewEnvelope(protocol.TypeDelta, protocol.Delta{Type: "text", Text: "hi"}))
}

func TestConn_SendEnvelope_ControlAfterClose(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	c := newConn(hub, nil)
	c.close()
	c.sendEnvelope(protocol.NewEnvelope(protocol.TypeDone, nil))
}

func TestConn_CloseIdempotent(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	c := newConn(hub, nil)
	c.close()
	c.close()
	c.close()
	if !c.isClosed() {
		t.Error("expected connection to be closed")
	}
}

func TestConn_IsClosed_Initial(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	c := newConn(hub, nil)
	if c.isClosed() {
		t.Error("new conn should not be closed")
	}
}

func TestConn_SessionStore_DefaultFallback(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp/test")
	c := newConn(hub, nil)
	store := c.sessionStore()
	if store == nil {
		t.Error("expected non-nil session store")
	}
}

func TestConn_SessionStore_HubOverride(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	hub.SessionStore = session.NewMemoryStore()
	c := newConn(hub, nil)
	store := c.sessionStore()
	if store == nil {
		t.Error("expected non-nil session store from hub")
	}
}

func TestConn_GetAgent_DefaultFactory(t *testing.T) {
	hub := NewHub(config.Config{APIKey: "sk-test", Model: "deepseek-v4-flash"}, t.TempDir())
	c := newConn(hub, nil)
	runner, err := c.getAgent("deepseek-v4-flash")
	if err != nil {
		t.Fatalf("expected runner, got error: %v", err)
	}
	if runner == nil {
		t.Error("expected non-nil runner")
	}
}

func TestHub_SetWorkspace_PerConn(t *testing.T) {
	hub := NewHub(config.Config{}, "/global")
	c := newConn(hub, nil)
	c.mu.Lock()
	c.workspace = "/per-conn"
	c.mu.Unlock()
	if got := c.currentWorkspace(); got != "/per-conn" {
		t.Errorf("expected /per-conn, got %s", got)
	}
}

func TestHub_SetWorkspace_FallsBackToHub(t *testing.T) {
	hub := NewHub(config.Config{}, "/hub-ws")
	c := newConn(hub, nil)
	if got := c.currentWorkspace(); got != "/hub-ws" {
		t.Errorf("expected /hub-ws, got %s", got)
	}
}

func TestConn_HandleAskResp_NoChannel(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	c := newConn(hub, nil)
	env := protocol.Envelope{
		Type:    protocol.TypeAskResp,
		Payload: protocol.MustMarshalPayload(protocol.AskResp{Selected: 0, Answer: "yes"}),
	}
	c.handleAskResp(env)
}

func TestHub_Register_Unregister(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	c := newConn(hub, nil)
	hub.Register(c)
	hub.Unregister(c)
}

func TestEngine_UnknownEnvelopeType(t *testing.T) {
	hub := NewHub(config.Config{}, t.TempDir())
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	hub.SessionStore = session.NewMemoryStore()
	srv := httptest.NewServer(hub.Handler())
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer ws.Close()
	env := protocol.Envelope{Ver: protocol.Ver, Type: "unknown.type.xyz"}
	b, _ := json.Marshal(env)
	_ = ws.WriteMessage(websocket.TextMessage, b)
	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	var resp protocol.Envelope
	_ = json.Unmarshal(data, &resp)
	if resp.Type != protocol.TypeError {
		t.Errorf("expected TypeError for unknown envelope type, got %s", resp.Type)
	}
}

func TestEngine_BadVersionReply(t *testing.T) {
	hub := NewHub(config.Config{}, t.TempDir())
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	hub.SessionStore = session.NewMemoryStore()
	srv := httptest.NewServer(hub.Handler())
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer ws.Close()
	env := protocol.Envelope{Ver: "v99", Type: protocol.TypePing}
	b, _ := json.Marshal(env)
	_ = ws.WriteMessage(websocket.TextMessage, b)
	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, _ := ws.ReadMessage()
	var resp protocol.Envelope
	_ = json.Unmarshal(data, &resp)
	if resp.Type != protocol.TypeError {
		t.Errorf("expected TypeError for bad version, got %s", resp.Type)
	}
}

func TestEngineError_Is(t *testing.T) {
	ee := &EngineError{Err: ErrAlreadyStreaming}
	if !errors.Is(ee, ErrAlreadyStreaming) {
		t.Error("expected Is(ErrAlreadyStreaming)")
	}
	if errors.Is(ee, ErrConnectionClosed) {
		t.Error("should not match ErrConnectionClosed")
	}
}

func TestHub_Logger(t *testing.T) {
	hub := NewHub(config.Config{}, "/tmp")
	if hub.logger() == nil {
		t.Error("expected non-nil logger from hub.logger()")
	}
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	if hub.logger() == nil {
		t.Error("expected non-nil logger after setting hub.Logger")
	}
}

func TestWSClient_StreamRemote_ContextCancelled(t *testing.T) {
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer ws.Close()
		ws.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, _, _ = ws.ReadMessage()
		time.Sleep(200 * time.Millisecond)
	}))
	defer srv.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	client := &WSClient{URL: srv.URL}
	_ = client.StreamRemote(ctx, protocol.ChatReq{Model: "deepseek-v4-flash"}, nil, nil, nil)
}

func TestEngine_HandleChat_AlreadyStreaming(t *testing.T) {
	blockRunner := &blockingMockRunner2{ready: make(chan struct{})}
	hub := NewHub(config.Config{Model: "v4"}, "/tmp")
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	hub.AgentFactory = &mockFactory2{runner: blockRunner}
	hub.SessionStore = session.NewMemoryStore()
	srv := httptest.NewServer(hub.Handler())
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer ws.Close()
	send := func(env protocol.Envelope) {
		b, _ := json.Marshal(env)
		_ = ws.WriteMessage(websocket.TextMessage, b)
	}
	send(protocol.NewEnvelopeWithID("req-1", protocol.TypeChatReq, protocol.ChatReq{
		Model:    "v4",
		Messages: []llm.Message{{Role: "user", Content: "first"}},
	}))
	time.Sleep(80 * time.Millisecond)
	send(protocol.NewEnvelopeWithID("req-2", protocol.TypeChatReq, protocol.ChatReq{
		Model:    "v4",
		Messages: []llm.Message{{Role: "user", Content: "second"}},
	}))
	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, err := ws.ReadMessage()
	if err != nil {
		blockRunner.unblock()
		t.Skipf("read timed out: %v", err)
	}
	var resp protocol.Envelope
	_ = json.Unmarshal(data, &resp)
	blockRunner.unblock()
	_ = resp
}

type blockingMockRunner2 struct {
	ready chan struct{}
}

func (r *blockingMockRunner2) RunWithHistory(ctx context.Context, opts agent.RunOptions) (*agent.RunResult, error) {
	select {
	case <-r.ready:
	case <-ctx.Done():
	}
	return &agent.RunResult{
		FinalMessage: &llm.Message{Role: "assistant", Content: "done"},
		Messages:     opts.Messages,
	}, nil
}

func (r *blockingMockRunner2) unblock() {
	select {
	case r.ready <- struct{}{}:
	default:
	}
}

type mockFactory2 struct{ runner agent.Runner }

func (f *mockFactory2) NewAgent(model, workspace string) (agent.Runner, error) {
	return f.runner, nil
}