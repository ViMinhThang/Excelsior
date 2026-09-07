package engine

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"runtime"
	"strings"

	"excelsior/internal/sessions"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
)

// All run state and snapshot/event ordering use runsMu. Never hold it while running tools.
type turnState struct {
	id, workspace, sessionID string
	cancel                   context.CancelFunc
	done                     chan struct{}
	messages                 []llm.Message
	events                   []protocol.Delta
	pending                  *protocol.Envelope
	response                 chan protocol.Envelope
	interactionID            string
}

func canonicalWorkspace(path string) string {
	if abs, err := filepath.Abs(path); err == nil {
		path = abs
	}
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		path = resolved
	}
	path = filepath.Clean(path)
	if runtime.GOOS == "windows" {
		path = strings.ToLower(path)
	}
	return path
}

func sessionKey(workspace, id string) string { return workspace + "\x00" + id }

func (h *Hub) store(workspace string) session.Store {
	h.runsMu.Lock()
	defer h.runsMu.Unlock()
	return h.storeLocked(workspace)
}

func (h *Hub) storeLocked(workspace string) session.Store {
	if h.SessionStore != nil {
		return h.SessionStore
	}
	if h.stores[workspace] == nil {
		h.stores[workspace] = session.NewDirStore(filepath.Join(workspace, ".excelsior", "sessions"))
	}
	return h.stores[workspace]
}

func (c *Conn) beginTurn(_ context.Context, id string, incoming ...llm.Message) (context.Context, *turnState, error) {
	h := c.hub
	h.runsMu.Lock()
	defer h.runsMu.Unlock()
	workspace := c.currentWorkspace()
	key := sessionKey(workspace, id)
	if h.stopped || h.turns[key] != nil {
		return nil, nil, fmt.Errorf("session busy or engine stopped")
	}
	ctx, cancel := context.WithCancel(context.Background())
	t := &turnState{id: newID(), workspace: workspace, sessionID: id, cancel: cancel, done: make(chan struct{})}
	record, err := h.storeLocked(workspace).Load(id)
	if err != nil && !errors.Is(err, session.ErrSessionNotFound) {
		cancel()
		return nil, nil, err
	}
	if errors.Is(err, session.ErrSessionNotFound) {
		// Make a new run discoverable from another device before its first turn finishes.
		record = session.Record{ID: id, Title: sessions.Title(incoming, "")}
		if err := h.storeLocked(workspace).Save(record); err != nil {
			cancel()
			return nil, nil, err
		}
	}
	t.messages = append(record.Messages, incoming...)
	h.turns[key] = t
	return ctx, t, nil
}

func (c *Conn) endTurn(_ string, t *turnState) {
	h := c.hub
	h.runsMu.Lock()
	defer h.runsMu.Unlock()
	delete(h.turns, sessionKey(t.workspace, t.sessionID))
	t.cancel()
	close(t.done)
	h.BroadcastToSession(t.workspace, t.sessionID, protocol.NewEnvelope(protocol.TypeDone, map[string]string{"sessionId": t.sessionID, "runId": t.id}))
}

// Close stops runs and sockets. Client disconnects never call this.
func (h *Hub) Close() {
	h.runsMu.Lock()
	h.stopped = true
	for _, t := range h.turns {
		t.cancel()
	}
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
	h := c.hub
	h.runsMu.Lock()
	defer h.runsMu.Unlock()
	t := h.turns[sessionKey(c.currentWorkspace(), req.SessionID)]
	if t == nil || req.RunID != t.id {
		c.sendError(env.ID, "run no longer active")
		return
	}
	t.cancel()
}

func (c *Conn) snapshot(env protocol.Envelope, id string) {
	h := c.hub
	h.runsMu.Lock()
	defer h.runsMu.Unlock()
	workspace := c.currentWorkspace()
	data := protocol.SessionDataResp{ID: id, Messages: []llm.Message{}}
	if t := h.turns[sessionKey(workspace, id)]; t != nil {
		data.RunID, data.Running, data.Events, data.Pending = t.id, true, t.events, t.pending
		data.Messages = t.messages
	} else {
		record, err := h.storeLocked(workspace).Load(id)
		if err != nil {
			c.sendError(env.ID, err.Error())
			return
		}
		data.Messages = record.Messages
	}
	c.subscribe(id)
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionData, data))
}

func (c *Conn) respond(env protocol.Envelope, id, runID, interactionID, kind string) {
	h := c.hub
	h.runsMu.Lock()
	defer h.runsMu.Unlock()
	t := h.turns[sessionKey(c.currentWorkspace(), id)]
	if t == nil || t.id != runID || t.pending == nil || t.pending.Type != kind || t.interactionID != interactionID {
		c.sendError(env.ID, "interaction no longer pending")
		return
	}
	t.response <- env
	t.pending = nil
	h.BroadcastToSession(t.workspace, id, protocol.NewEnvelope(protocol.TypeInteractionDone, map[string]string{"sessionId": id, "runId": runID, "interactionId": interactionID}))
}

func (h *Hub) interaction(ctx context.Context, t *turnState, env protocol.Envelope, id string) (protocol.Envelope, error) {
	h.runsMu.Lock()
	t.pending, t.interactionID, t.response = &env, id, make(chan protocol.Envelope, 1)
	response := t.response
	h.BroadcastToSession(t.workspace, t.sessionID, env)
	h.runsMu.Unlock()
	select {
	case resp := <-response:
		return resp, nil
	case <-ctx.Done():
		return protocol.Envelope{}, ctx.Err()
	}
}
