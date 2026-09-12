package engine

import (
	"context"
	"errors"
	"excelsior/pkg/protocol"
	"github.com/gorilla/websocket"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRemoteTerminalStatuses(t *testing.T) {
	for _, status := range []string{"succeeded", "failed", "canceled", "persistence_failed"} {
		t.Run(status, func(t *testing.T) {
			err := outcomeError(protocol.DoneResp{RunID: "run", Status: status, Persisted: status == "succeeded", Error: "injected"})
			if (err == nil) != (status == "succeeded") {
				t.Fatalf("status %s: %v", status, err)
			}
			if status == "canceled" && !errors.Is(err, context.Canceled) {
				t.Fatal(err)
			}
		})
	}
	if outcomeError(protocol.DoneResp{Status: "succeeded", Persisted: false}) == nil {
		t.Fatal("unsaved success accepted")
	}
}

func TestRemoteCancelWaitsForAcknowledgedRun(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	serverErr := make(chan error, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			serverErr <- err
			return
		}
		defer ws.Close()
		fail := func(err error) { serverErr <- err }
		var in protocol.Envelope
		if err = ws.ReadJSON(&in); err != nil {
			fail(err)
			return
		}
		ws.WriteJSON(protocol.NewEnvelope(protocol.TypeAuth, map[string]any{"ok": true, "capabilities": []string{protocol.RunLifecycleCapability}}))
		if err = ws.ReadJSON(&in); err != nil {
			fail(err)
			return
		}
		if in.Type != protocol.TypeChatReq {
			fail(errors.New("expected chat"))
			return
		}
		cancel()
		time.Sleep(30 * time.Millisecond)
		ws.WriteJSON(protocol.NewEnvelopeWithID("start", protocol.TypeSessionData, protocol.SessionDataResp{ID: "session", RunID: "acknowledged-run", Running: true}))
		if err = ws.ReadJSON(&in); err != nil {
			fail(err)
			return
		}
		var payload map[string]string
		in.Decode(&payload)
		if in.Type != protocol.TypeChatCancel || payload["runId"] != "acknowledged-run" || payload["sessionId"] != "session" {
			fail(errors.New("cancel not bound to acknowledged run"))
			return
		}
		ws.WriteJSON(protocol.NewEnvelope(protocol.TypeDone, protocol.DoneResp{SessionID: "session", RunID: "acknowledged-run", Status: "canceled"}))
		serverErr <- nil
	}))
	defer srv.Close()
	client := &WSClient{URL: "ws" + strings.TrimPrefix(srv.URL, "http")}
	err := client.StreamRemote(ctx, protocol.ChatReq{SessionID: "session"}, nil, nil, nil)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected confirmed cancellation: %v", err)
	}
	if err := <-serverErr; err != nil {
		t.Fatal(err)
	}
}
