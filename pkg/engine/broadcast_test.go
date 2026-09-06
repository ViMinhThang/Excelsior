package engine

import (
	"testing"

	"excelsior/pkg/config"
	"excelsior/pkg/protocol"
)

func TestBroadcastToSessionScopesByUserAndSubscription(t *testing.T) {
	hub := NewHub(config.Config{}, t.TempDir())
	first := newConn(hub, nil)
	first.userID = 1
	first.subscribe("session-1")
	second := newConn(hub, nil)
	second.userID = 2
	second.subscribe("session-1")
	otherSession := newConn(hub, nil)
	otherSession.userID = 1
	otherSession.subscribe("session-2")
	hub.Register(first)
	hub.Register(second)
	hub.Register(otherSession)
	defer hub.Unregister(first)
	defer hub.Unregister(second)
	defer hub.Unregister(otherSession)

	hub.BroadcastToSession(1, "session-1", protocol.NewEnvelope(protocol.TypeDelta, protocol.Delta{Type: "text", Text: "hello"}))

	select {
	case <-first.send:
	default:
		t.Fatal("subscribed owner did not receive session event")
	}
	select {
	case <-second.send:
		t.Fatal("different user received session event")
	default:
	}
	select {
	case <-otherSession.send:
		t.Fatal("different session received session event")
	default:
	}
}
