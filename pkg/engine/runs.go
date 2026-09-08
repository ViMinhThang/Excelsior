package engine

import (
	"strings"

	"excelsior/internal/chat"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
)

func canonicalWorkspace(path string) string {
	return chat.CanonicalWorkspace(path)
}

func sessionKey(workspace, id string) string { return canonicalWorkspace(workspace) + "\x00" + id }

func splitSessionKey(key string) (workspace, id string) {
	ws, rest, _ := strings.Cut(key, "\x00")
	return ws, rest
}

func (h *Hub) store(workspace string) session.Store {
	return h.Coordinator().Store(workspace)
}

// Close stops runs and sockets. Client disconnects never call this.
func (h *Hub) Close() {
	h.Coordinator().Close()
	h.runsMu.Lock()
	h.stopped = true
	h.runsMu.Unlock()
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		c.close()
	}
}

func (c *Conn) cancelTurn(env protocol.Envelope) {
	var req struct {
		SessionID string `json:"sessionId"`
		RunID     string `json:"runId"`
	}
	if !c.decodePayload(env, &req, "chat.cancel") {
		return
	}
	if err := c.hub.Coordinator().Cancel(c.currentWorkspace(), req.SessionID, req.RunID); err != nil {
		c.sendError(env.ID, err.Error())
	}
}

func (c *Conn) snapshot(env protocol.Envelope, id string) {
	// Read the snapshot first so the reply is ordered before any live event
	// delivered to this conn, then register the subscription.
	snap, err := c.hub.Coordinator().Snapshot(c.currentWorkspace(), id)
	if err != nil {
		c.sendError(env.ID, err.Error())
		return
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionData, snapshotToSessionData(snap, id)))
	c.subscribe(id)
}
