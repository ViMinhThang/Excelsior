package engine

import (
	"encoding/json"
	"io"
	"log/slog"
	"testing"
	"time"

	"excelsior/internal/chat"
	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
)

// Events must reach only connections subscribed to the session in its workspace.
func TestSessionEventsScopedByWorkspaceAndSubscription(t *testing.T) {
	hub := NewHub(config.Config{}, t.TempDir())
	hub.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	hub.NewAgent = func(model, workspace string) (agent.Runner, error) {
		return &mockRunner{
			events:   []agent.StreamEvent{{Type: "text", Text: "hello"}},
			finalMsg: &llm.Message{Role: "assistant", Content: "hello"},
		}, nil
	}
	hub.SessionStore = session.NewMemoryStore()

	first := newConn(hub, nil)
	other := newConn(hub, nil)
	other.workspace.Set(canonicalWorkspace(t.TempDir()))

	ws := hub.Workspace()
	coord := hub.Coordinator()
	first.snapshot(protocol.Envelope{}, "session-1")
	other.snapshot(protocol.Envelope{}, "session-1")
	select {
	case <-first.send:
	case <-time.After(time.Second):
		t.Fatal("no snapshot")
	}
	select {
	case <-other.send:
	case <-time.After(time.Second):
		t.Fatal("no snapshot")
	}
	defer first.close()
	defer other.close()
	defer hub.Close()

	h, err := coord.ReserveTurn(ws, "session-1", llm.Message{Role: "user", Content: "hello"})
	if err != nil {
		t.Fatal(err)
	}
	go coord.ExecuteTurn(chat.StartCommand{}, h)

	// Drain until the terminal outcome reaches the subscribed connection.
	for {
		select {
		case msg := <-first.send:
			var env protocol.Envelope
			_ = json.Unmarshal(msg, &env)
			if env.Type == protocol.TypeDone {
				goto drained
			}
		case <-time.After(2 * time.Second):
			t.Fatal("subscribed connection never received the outcome")
		}
	}
drained:
	select {
	case msg := <-other.send:
		var env protocol.Envelope
		_ = json.Unmarshal(msg, &env)
		t.Fatalf("different workspace received session event: %s", env.Type)
	default:
	}
}
