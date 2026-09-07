package engine

import (
	"context"
	"excelsior/internal/chat"
	"excelsior/internal/permissions"
	"excelsior/pkg/config"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
	"excelsior/pkg/tools"
)

func (c *Conn) handleChat(ctx context.Context, env protocol.Envelope, sessionID string, t *turnState) {
	var req protocol.ChatReq
	if !c.decodePayload(env, &req, "chat.req") {
		return
	}
	h := c.hub
	fail := func(err error) {
		h.BroadcastToSession(t.workspace, sessionID, protocol.NewEnvelopeWithID(env.ID, protocol.TypeError, map[string]string{"error": err.Error(), "sessionId": sessionID, "runId": t.id}))
	}
	h.runsMu.Lock()
	h.BroadcastToSession(t.workspace, sessionID, protocol.NewEnvelope(protocol.TypeSessionData, protocol.SessionDataResp{ID: sessionID, Messages: t.messages, Running: true, RunID: t.id}))
	h.runsMu.Unlock()
	ag, err := c.agentFor(req.Model, t.workspace)
	if err != nil {
		fail(err)
		return
	}
	ctx = tools.WithPermissionHandler(ctx, func(ctx context.Context, rq tools.PermissionRequest) (tools.PermissionResponse, error) {
		perm, _ := permissions.Resolve(h.PermissionOverride, config.LoadSettings(t.workspace))
		switch perm {
		case config.PermissionAllow:
			return tools.PermissionResponse{Approved: true}, nil
		case config.PermissionDeny:
			return tools.PermissionResponse{Approved: false}, nil
		}
		id := newID()
		response, err := h.interaction(ctx, t, protocol.NewEnvelope(protocol.TypePermissionReq, protocol.PermissionReq{
			SessionID: sessionID, RunID: t.id, InteractionID: id, Tool: rq.Tool, FilePath: rq.FilePath, Preview: rq.Preview, Command: rq.Command,
		}), id)
		var resp protocol.PermissionResp
		if err == nil {
			err = response.Decode(&resp)
		}
		return tools.PermissionResponse{Approved: resp.Approved}, err
	})
	ctx = tools.WithQuestionHandler(ctx, func(ctx context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
		id := newID()
		response, err := h.interaction(ctx, t, protocol.NewEnvelope(protocol.TypeAskReq, protocol.AskReq{
			SessionID: sessionID, RunID: t.id, InteractionID: id, Question: rq.Question, Options: rq.Options,
		}), id)
		var resp protocol.AskResp
		if err == nil {
			err = response.Decode(&resp)
		}
		return tools.AskResponse{Selected: resp.Selected, Answer: resp.Answer, Label: resp.Label}, err
	})
	rec := session.Record{ID: sessionID}
	if t.handle != nil {
		rec = t.handle.Record
	}
	_, err = (chat.Service{Runner: ag, Store: h.store(t.workspace)}).RunPrepared(ctx, chat.PreparedTurn{
		SessionID: sessionID,
		RunID:     t.id,
		Messages:  t.messages,
		Record:    rec,
		OnEvent: func(ev chat.Event) {
			d := protocol.Delta{SessionID: sessionID, RunID: t.id, Type: ev.Type, Text: ev.Text, Reasoning: ev.Reasoning, ToolName: ev.ToolName, ToolCallID: ev.ToolCallID, ToolArgs: ev.ToolArgs, ToolResult: ev.ToolResult, FinishReason: ev.FinishReason}
			if ev.Usage != nil {
				d.PromptTokens, d.CompletionTokens, d.TotalTokens = ev.Usage.PromptTokens, ev.Usage.CompletionTokens, ev.Usage.TotalTokens
			}
			h.runsMu.Lock()
			defer h.runsMu.Unlock()
			// Coalesce text fragments; retain tool events to reconstruct the current turn.
			n := len(t.events)
			if n > 0 && (d.Type == "text" || d.Type == "reasoning") && t.events[n-1].Type == d.Type {
				t.events[n-1].Text += d.Text
				t.events[n-1].Reasoning += d.Reasoning
			} else {
				t.events = append(t.events, d)
			}
			h.BroadcastToSession(t.workspace, sessionID, protocol.NewEnvelope(protocol.TypeDelta, d))
		},
	})
	if err != nil {
		fail(err)
	}
}
