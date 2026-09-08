package engine

import (
	"excelsior/internal/chat"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
)

// Conn implements chat.Subscriber: coordinator events are converted to wire
// envelopes and delivered to this connection only.

func eventToDelta(ev chat.Event) protocol.Delta {
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
		d.PromptTokens, d.CompletionTokens, d.TotalTokens = ev.Usage.PromptTokens, ev.Usage.CompletionTokens, ev.Usage.TotalTokens
	}
	return d
}

func pendingEnvelope(pi chat.PendingInteraction) protocol.Envelope {
	if pi.Kind == chat.InteractionAsk {
		req := protocol.AskReq{RunID: pi.RunID, InteractionID: pi.ID, SessionID: pi.SessionID}
		if pi.Ask != nil {
			req.Question, req.Options = pi.Ask.Question, pi.Ask.Options
		}
		return protocol.NewEnvelope(protocol.TypeAskReq, req)
	}
	req := protocol.PermissionReq{RunID: pi.RunID, InteractionID: pi.ID, SessionID: pi.SessionID}
	if pi.Permission != nil {
		req.Tool, req.FilePath, req.Preview, req.Command = pi.Permission.Tool, pi.Permission.FilePath, pi.Permission.Preview, pi.Permission.Command
	}
	return protocol.NewEnvelope(protocol.TypePermissionReq, req)
}

func snapshotToSessionData(snap chat.Snapshot, id string) protocol.SessionDataResp {
	data := protocol.SessionDataResp{ID: id, RunID: snap.RunID, Running: snap.Running, Messages: snap.Messages}
	if data.Messages == nil {
		data.Messages = []llm.Message{}
	}
	for _, ev := range snap.Events {
		data.Events = append(data.Events, eventToDelta(ev))
	}
	if snap.Pending != nil {
		env := pendingEnvelope(*snap.Pending)
		data.Pending = &env
	}
	return data
}

func (c *Conn) OnEvent(ev chat.Event) {
	c.sendEnvelope(protocol.NewEnvelope(protocol.TypeDelta, eventToDelta(ev)))
}

func (c *Conn) OnInteraction(pi chat.PendingInteraction) {
	c.sendEnvelope(pendingEnvelope(pi))
}

func (c *Conn) OnInteractionDone(sessionID, runID, interactionID string) {
	c.sendEnvelope(protocol.NewEnvelope(protocol.TypeInteractionDone, map[string]string{
		"sessionId": sessionID, "runId": runID, "interactionId": interactionID,
	}))
}

func (c *Conn) OnDone(o chat.Outcome) {
	c.mu.Lock()
	delete(c.errIDs, o.SessionID)
	c.mu.Unlock()
	c.sendEnvelope(protocol.NewEnvelope(protocol.TypeDone, protocol.DoneResp{
		SessionID: o.SessionID,
		RunID:     o.RunID,
		Status:    o.Status,
		Persisted: o.Persisted,
		Error:     o.Error,
		Code:      o.Code,
	}))
}

func (c *Conn) OnError(sessionID, runID, errMsg string) {
	c.mu.Lock()
	id := c.errIDs[sessionID]
	delete(c.errIDs, sessionID)
	c.mu.Unlock()
	c.sendEnvelope(protocol.NewEnvelopeWithID(id, protocol.TypeError, map[string]string{
		"error": errMsg, "sessionId": sessionID, "runId": runID,
	}))
}

// dispatchChat reserves the turn and hands execution to the coordinator.
func (c *Conn) dispatchChat(env protocol.Envelope, req protocol.ChatReq) {
	workspace := c.currentWorkspace()
	_, handle, err := c.hub.Coordinator().ReserveTurn(workspace, req.SessionID, req.Messages...)
	if err != nil {
		c.sendError(env.ID, err.Error())
		return
	}
	c.mu.Lock()
	if c.errIDs == nil {
		c.errIDs = make(map[string]string)
	}
	c.errIDs[handle.SessionID] = env.ID
	c.mu.Unlock()

	c.subscribe(handle.SessionID)
	c.hub.BroadcastToSession(workspace, handle.SessionID, protocol.NewEnvelope(protocol.TypeSessionData, protocol.SessionDataResp{
		ID: handle.SessionID, RunID: handle.ID, Running: true, Messages: handle.Messages,
	}))

	go c.hub.Coordinator().ExecuteTurn(chat.StartCommand{
		Workspace: handle.Workspace,
		SessionID: handle.SessionID,
		Model:     req.Model,
		Messages:  req.Messages,
	}, handle)
}
