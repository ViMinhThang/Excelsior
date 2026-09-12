package engine

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"excelsior/internal/chat"
	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
	"excelsior/pkg/tools"
	"github.com/gorilla/websocket"
)

func authenticateTest(t *testing.T, ws *websocket.Conn, token string) {
	t.Helper()
	sendTest(t, ws, protocol.TypeAuth, map[string]string{"token": token})
	if env := readTest(t, ws); env.Type != protocol.TypeAuth {
		t.Fatalf("auth: %+v", env)
	}
}
func sendTest(t *testing.T, ws *websocket.Conn, kind string, payload any) {
	t.Helper()
	if err := ws.WriteJSON(protocol.NewEnvelope(kind, payload)); err != nil {
		t.Fatal(err)
	}
}
func readTest(t *testing.T, ws *websocket.Conn) protocol.Envelope {
	t.Helper()
	_ = ws.SetReadDeadline(time.Now().Add(3 * time.Second))
	var env protocol.Envelope
	if err := ws.ReadJSON(&env); err != nil {
		t.Fatal(err)
	}
	return env
}
func dialTest(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	ws, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ws.Close() })
	authenticateTest(t, ws, "test-token")
	return ws
}

func TestOwnerAuthentication(t *testing.T) {
	h := NewHub(config.Config{}, t.TempDir())
	h.Token = "test-token"
	h.AllowedOrigins = []string{"https://desktop.example"}
	srv := httptest.NewServer(h.Handler())
	defer srv.Close()
	defer h.Close()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	for _, origin := range []string{"https://evil.example", "null"} {
		ws, resp, err := websocket.DefaultDialer.Dial(url, http.Header{"Origin": []string{origin}})
		if ws != nil {
			ws.Close()
		}
		if err == nil {
			t.Fatal("untrusted origin accepted")
		}
		if resp != nil {
			resp.Body.Close()
		}
	}
	for _, token := range []string{"", "wrong"} {
		ws, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err != nil {
			t.Fatal(err)
		}
		sendTest(t, ws, protocol.TypeAuth, map[string]string{"token": token})
		_ = ws.SetReadDeadline(time.Now().Add(time.Second))
		if _, _, err = ws.ReadMessage(); err == nil {
			t.Fatal("invalid token accepted")
		}
		ws.Close()
	}
	ws, _, err := websocket.DefaultDialer.Dial(url+"?token=test-token", nil)
	if err != nil {
		t.Fatal(err)
	}
	sendTest(t, ws, protocol.TypeSessionList, nil)
	_ = ws.SetReadDeadline(time.Now().Add(time.Second))
	if _, _, err = ws.ReadMessage(); err == nil {
		t.Fatal("operation before auth accepted")
	}
	ws.Close()
	good := dialTest(t, url)
	sendTest(t, good, protocol.TypePing, nil)
	if readTest(t, good).Type != protocol.TypePong {
		t.Fatal("authenticated ping failed")
	}
}

type controlledRunner struct {
	release  chan struct{}
	approved chan bool
}

func (r *controlledRunner) RunWithHistory(ctx context.Context, opts agent.RunOptions) (*agent.RunResult, error) {
	opts.OnEvent(agent.StreamEvent{Type: "text", Text: "partial"})
	handler, _ := tools.GetPermissionHandler(ctx)
	resp, err := handler(ctx, tools.PermissionRequest{Tool: "write", FilePath: "test.txt"})
	if err != nil {
		return nil, err
	}
	r.approved <- resp.Approved
	select {
	case <-r.release:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	message := llm.Message{Role: "assistant", Content: "partial complete"}
	return &agent.RunResult{Messages: append(opts.Messages, message), FinalMessage: &message}, nil
}

func TestRunSurvivesDisconnectAndApprovesFromOtherClient(t *testing.T) {
	root := t.TempDir()
	h := NewHub(config.Config{}, root)
	h.Token = "test-token"
	runner := &controlledRunner{release: make(chan struct{}), approved: make(chan bool, 1)}
	h.NewAgent = func(_, workspace string) (agent.Runner, error) {
		if workspace != canonicalWorkspace(root) {
			t.Errorf("wrong workspace %s", workspace)
		}
		return runner, nil
	}
	srv := httptest.NewServer(h.Handler())
	defer srv.Close()
	defer h.Close()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/ws"
	first := dialTest(t, url)
	sendTest(t, first, protocol.TypeChatReq, protocol.ChatReq{SessionID: "session-1", Messages: []llm.Message{{Role: "user", Content: "hello"}}})
	var pending protocol.PermissionReq
	for {
		env := readTest(t, first)
		if env.Type == protocol.TypePermissionReq {
			_ = env.Decode(&pending)
			break
		}
	}
	first.Close()
	second := dialTest(t, url)
	sendTest(t, second, protocol.TypeSessionList, nil)
	listEnvelope := readTest(t, second)
	var list protocol.SessionListResp
	_ = listEnvelope.Decode(&list)
	if len(list.Sessions) != 1 || list.Sessions[0].ID != "session-1" {
		t.Fatalf("new active session not discoverable: %+v", list)
	}
	sendTest(t, second, protocol.TypeSessionData, protocol.SessionDataReq{ID: "session-1"})
	env := readTest(t, second)
	var snapshot protocol.SessionDataResp
	_ = env.Decode(&snapshot)
	if env.Type != protocol.TypeSessionData || !snapshot.Running || snapshot.Pending == nil || len(snapshot.Events) != 1 || snapshot.Events[0].Text != "partial" || len(snapshot.Messages) != 1 {
		t.Fatalf("bad reconnect snapshot %+v", snapshot)
	}
	sendTest(t, second, protocol.TypeChatReq, protocol.ChatReq{SessionID: "session-1"})
	if env = readTest(t, second); env.Type != protocol.TypeError {
		t.Fatal("duplicate turn allowed")
	}
	for _, kind := range []string{protocol.TypeSessionDelete, protocol.TypeSessionRename} {
		sendTest(t, second, kind, map[string]string{"id": "session-1", "title": "bad"})
		if readTest(t, second).Type != protocol.TypeError {
			t.Fatal("mutated busy session")
		}
	}
	response := protocol.PermissionResp{SessionID: pending.SessionID, RunID: pending.RunID, InteractionID: pending.InteractionID, Approved: true}
	stale := response
	stale.InteractionID = "stale"
	sendTest(t, second, protocol.TypePermissionResp, stale)
	if readTest(t, second).Type != protocol.TypeError {
		t.Fatal("stale approval accepted")
	}
	sendTest(t, second, protocol.TypePermissionResp, response)
	for i := 0; i < 2; i++ {
		env := readTest(t, second)
		if env.Type != protocol.TypePermissionResp && env.Type != protocol.TypeInteractionDone {
			t.Fatalf("unexpected approval response: %s", env.Type)
		}
	}
	select {
	case approved := <-runner.approved:
		if !approved {
			t.Fatal("approval lost")
		}
	case <-time.After(time.Second):
		t.Fatal("approval did not reach run")
	}
	sendTest(t, second, protocol.TypePermissionResp, response)
	if readTest(t, second).Type != protocol.TypeError {
		t.Fatal("duplicate approval accepted")
	}
	close(runner.release)
	if readTest(t, second).Type != protocol.TypeDone {
		t.Fatal("missing completion")
	}
	sendTest(t, second, protocol.TypeSessionData, protocol.SessionDataReq{ID: "session-1"})
	env = readTest(t, second)
	_ = env.Decode(&snapshot)
	if snapshot.Running || len(snapshot.Messages) != 2 {
		t.Fatalf("history not saved %+v", snapshot)
	}
}

func TestRunWorkspaceScopeAndCancellation(t *testing.T) {
	h := NewHub(config.Config{}, t.TempDir())
	defer h.Close()
	coord := h.Coordinator()
	handle, err := coord.ReserveTurn(h.Workspace(), "session-1", llm.Message{Role: "user", Content: "hello"})
	if err != nil {
		t.Fatal("start failed")
	}
	if _, err := coord.ReserveTurn(h.Workspace(), "session-1", llm.Message{Role: "user", Content: "hello"}); !errors.Is(err, chat.ErrSessionBusy) {
		t.Fatal("cross-client duplicate")
	}
	a := newConn(h, nil)
	a.close()
	select {
	case <-handle.Context.Done():
		t.Fatal("disconnect canceled run")
	default:
	}
	b := newConn(h, nil)
	b.workspace.Set(canonicalWorkspace(t.TempDir()))
	otherHandle, err := coord.ReserveTurn(b.currentWorkspace(), "session-1", llm.Message{Role: "user", Content: "hello"})
	if err != nil {
		t.Fatal("different workspace blocked")
	}
	b.cancelTurn(protocol.NewEnvelope(protocol.TypeChatCancel, map[string]string{"sessionId": "session-1", "runId": handle.ID}))
	select {
	case <-handle.Context.Done():
		t.Fatal("wrong workspace canceled run")
	default:
	}
	b.workspace.Set(h.Workspace())
	b.cancelTurn(protocol.NewEnvelope(protocol.TypeChatCancel, map[string]string{"sessionId": "session-1", "runId": handle.ID}))
	select {
	case <-handle.Context.Done():
	case <-time.After(time.Second):
		t.Fatal("cancel failed")
	}
	coord.ExecuteTurn(chat.StartCommand{}, handle)
	otherHandle.Cancel()
	coord.ExecuteTurn(chat.StartCommand{}, otherHandle)

}

func TestCorruptHistoryIsNotOverwritten(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, ".excelsior", "sessions")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "broken.jsonl")
	original := []byte("not json")
	if err := os.WriteFile(path, original, 0600); err != nil {
		t.Fatal(err)
	}
	h := NewHub(config.Config{}, root)
	defer h.Close()
	if _, err := h.Coordinator().ReserveTurn(h.Workspace(), "broken"); err == nil {
		t.Fatal("corrupt history accepted")
	}
	after, _ := os.ReadFile(path)
	if string(after) != string(original) {
		t.Fatal("corrupt history overwritten")
	}
}

func TestOwnerTokenRotation(t *testing.T) {
	t.Setenv("EXCELSIOR_TOKEN_FILE", filepath.Join(t.TempDir(), "config", "owner-token"))
	first, err := OwnerToken(false)
	if err != nil {
		t.Fatal(err)
	}
	second, err := OwnerToken(false)
	if err != nil || first != second || len(first) != 64 {
		t.Fatal("token not stable")
	}
	rotated, err := OwnerToken(true)
	if err != nil || rotated == first {
		t.Fatal("rotation failed")
	}
}

func TestSlowSubscriberCloses(t *testing.T) {
	h := NewHub(config.Config{}, t.TempDir())
	c := newConn(h, nil)
	for i := 0; i < cap(c.send)+1; i++ {
		c.sendEnvelope(protocol.NewEnvelope(protocol.TypeDelta, json.RawMessage(`{}`)))
	}
	if !c.isClosed() {
		t.Fatal("slow subscriber silently lost data")
	}
}

func TestAuthenticationDeadline(t *testing.T) {
	h := NewHub(config.Config{}, t.TempDir())
	h.Token = "test-token"
	srv := httptest.NewServer(h.Handler())
	defer srv.Close()
	defer h.Close()
	ws, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http")+"/v1/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()
	start := time.Now()
	_ = ws.SetReadDeadline(time.Now().Add(7 * time.Second))
	if _, _, err := ws.ReadMessage(); err == nil {
		t.Fatal("unauthenticated socket stayed open")
	}
	if elapsed := time.Since(start); elapsed < 4*time.Second || elapsed > 6*time.Second {
		t.Fatalf("auth deadline: %s", elapsed)
	}
}

func TestWSClientOwnerTokenAndWorkspace(t *testing.T) {
	h := NewHub(config.Config{}, t.TempDir())
	h.Token = "test-token"
	target := t.TempDir()
	h.NewAgent = func(_, workspace string) (agent.Runner, error) {
		if workspace != canonicalWorkspace(target) {
			t.Errorf("workspace not selected: %s", workspace)
		}
		return &mockRunner{events: []agent.StreamEvent{{Type: "text", Text: "hello"}}, finalMsg: &llm.Message{Role: "assistant", Content: "hello"}}, nil
	}
	srv := httptest.NewServer(h.Handler())
	defer srv.Close()
	defer h.Close()
	client := WSClient{URL: srv.URL, Token: "test-token", Workspace: target}
	var text string
	err := client.StreamRemote(context.Background(), protocol.ChatReq{SessionID: "remote-1", Messages: []llm.Message{{Role: "user", Content: "hello"}}}, func(d protocol.Delta) error { text += d.Text; return nil }, nil, nil)
	if err != nil || text != "hello" {
		t.Fatalf("remote run: %q, %v", text, err)
	}
	record, err := session.NewDirStore(filepath.Join(target, ".excelsior", "sessions")).Load("remote-1")
	if err != nil || len(record.Messages) != 2 {
		t.Fatalf("history: %+v %v", record, err)
	}
}
