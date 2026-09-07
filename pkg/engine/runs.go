package engine

import (
	"context"

	"excelsior/internal/chat"
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
	handle                   *chat.RunHandle
}

func canonicalWorkspace(path string) string {
	return chat.CanonicalWorkspace(path)
}

func sessionKey(workspace, id string) string { return canonicalWorkspace(workspace) + "\x00" + id }

func (h *Hub) store(workspace string) session.Store {
	return h.Coordinator().Store(workspace)
}

func (h *Hub) storeLocked(workspace string) session.Store {
	return h.Coordinator().Store(workspace)
}

func (c *Conn) beginTurn(_ context.Context, id string, incoming ...llm.Message) (context.Context, *turnState, error) {
	h := c.hub
	workspace := c.currentWorkspace()
	turnCtx, handle, err := h.Coordinator().ReserveTurn(workspace, id, incoming...)
	if err != nil {
		return nil, nil, err
	}
	t := &turnState{
		id:        handle.ID,
		workspace: workspace,
		sessionID: id,
		cancel:    handle.Cancel,
		done:      handle.Done,
		messages:  handle.Messages,
		handle:    handle,
	}
	h.runsMu.Lock()
	h.turns[sessionKey(workspace, id)] = t
	h.runsMu.Unlock()
	return turnCtx, t, nil
}

func (c *Conn) endTurn(_ string, t *turnState) {
	h := c.hub
	h.runsMu.Lock()
	delete(h.turns, sessionKey(t.workspace, t.sessionID))
	h.runsMu.Unlock()
	if t.handle != nil {
		h.Coordinator().EndTurn(t.handle, chat.Outcome{
			SessionID: t.sessionID,
			RunID:     t.id,
			Status:    chat.OutcomeSucceeded,
			Persisted: true,
		})
	}
	t.cancel()
	select {
	case <-t.done:
	default:
		close(t.done)
	}
	h.BroadcastToSession(t.workspace, t.sessionID, protocol.NewEnvelope(protocol.TypeDone, protocol.DoneResp{
		SessionID: t.sessionID,
		RunID:     t.id,
		Status:    chat.OutcomeSucceeded,
		Persisted: true,
	}))
}

// Close stops runs and sockets. Client disconnects never call this.
func (h *Hub) Close() {
	h.Coordinator().Close()
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
	t := h.turns[sessionKey(c.currentWorkspace(), req.SessionID)]
	if t == nil || req.RunID != t.id {
		h.runsMu.Unlock()
		c.sendError(env.ID, "run no longer active")
		return
	}
	t.cancel()
	h.runsMu.Unlock()
	_ = h.Coordinator().Cancel(c.currentWorkspace(), req.SessionID, req.RunID)
}

func (c *Conn) snapshot(env protocol.Envelope, id string) {
	h := c.hub
	workspace := c.currentWorkspace()
	data := protocol.SessionDataResp{ID: id, Messages: []llm.Message{}}

	h.runsMu.Lock()
	t := h.turns[sessionKey(workspace, id)]
	if t != nil {
		data.RunID, data.Running, data.Events, data.Pending = t.id, true, t.events, t.pending
		data.Messages = t.messages
		h.runsMu.Unlock()
	} else {
		h.runsMu.Unlock()
		snap, err := h.Coordinator().Snapshot(workspace, id)
		if err != nil {
			c.sendError(env.ID, err.Error())
			return
		}
		data.RunID = snap.RunID
		data.Running = snap.Running
		data.Messages = snap.Messages
		for _, ev := range snap.Events {
			d := protocol.Delta{
				SessionID:    ev.SessionID,
				RunID:        ev.RunID,
				Type:         ev.Type,
				Text:         ev.Text,
				Reasoning:    ev.Reasoning,
				ToolName:     ev.ToolName,
				ToolCallID:   ev.ToolCallID,
				ToolArgs:     ev.ToolArgs,
				ToolResult:   ev.ToolResult,
				FinishReason: ev.FinishReason,
			}
			if ev.Usage != nil {
				d.PromptTokens = ev.Usage.PromptTokens
				d.CompletionTokens = ev.Usage.CompletionTokens
				d.TotalTokens = ev.Usage.TotalTokens
			}
			data.Events = append(data.Events, d)
		}
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
