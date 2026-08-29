package engine

import (
	"encoding/json"
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

	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
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
