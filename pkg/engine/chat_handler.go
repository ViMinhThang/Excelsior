package engine

import (
	"context"
	"fmt"
	"time"

	"excelsior/pkg/agent"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
	"excelsior/pkg/tools"
)

func (c *Conn) handleChat(ctx context.Context, env protocol.Envelope) {
	var req protocol.ChatReq
	if !c.decodePayload(env, &req, "chat.req") {
		return
	}

	askCh := make(chan protocol.AskResp, 1)
	handler := c.askHandler(ctx, askCh)

	ag, err := c.getAgent(req.Model)
	if err != nil {
		c.sendError(env.ID, fmt.Sprintf("create agent: %v", err))
		return
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("%d", time.Now().UnixMilli())
	}

	history := c.loadHistory(ctx, sessionID, req.Messages)
	res, err := ag.RunWithHistory(tools.WithQuestionHandler(ctx, handler), agent.RunOptions{
		Messages: history,
		OnEvent:  c.deltaForwarder(),
	})
	if err != nil {
		c.sendError(env.ID, err.Error())
		return
	}

	if res != nil && len(res.Messages) > 0 {
		toSave := filterSystemMessages(res.Messages)
		rec, loadErr := c.sessionStore().Load(sessionID)
		if loadErr != nil {
			rec = session.Record{ID: sessionID, CreatedAt: time.Now().UTC()}
		}
		rec.Messages = toSave
		if err := c.sessionStore().Save(rec); err != nil {
			c.hub.logger().Warn("failed to save session history", "id", sessionID, "err", err)
		} else {
			c.hub.logger().Info("saved session history", "id", sessionID, "messages", len(toSave))
		}
	}

	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeDone, map[string]string{"sessionId": sessionID}))
}

func (c *Conn) loadHistory(ctx context.Context, sessionID string, incoming []llm.Message) []llm.Message {
	var history []llm.Message
	if rec, err := c.sessionStore().Load(sessionID); err == nil {
		for _, m := range rec.Messages {
			if m.Role == "system" && (m.Content == "New session" || m.Content == "(empty)") {
				continue
			}
			history = append(history, m)
		}
	}
	return append(history, incoming...)
}

func filterSystemMessages(msgs []llm.Message) []llm.Message {
	out := make([]llm.Message, 0, len(msgs))
	for _, m := range msgs {
		if m.Role != "system" {
			out = append(out, m)
		}
	}
	return out
}

func (c *Conn) deltaForwarder() func(agent.StreamEvent) {
	return func(ev agent.StreamEvent) {
		d := protocol.Delta{
			Type: ev.Type, Text: ev.Text, Reasoning: ev.Reasoning,
			ToolName: ev.ToolName, ToolCallID: ev.ToolCallID,
			ToolArgs: ev.ToolArgs, ToolResult: ev.ToolResult,
			FinishReason: ev.FinishReason,
		}
		c.sendEnvelope(protocol.NewEnvelope(protocol.TypeDelta, d))
	}
}

func (c *Conn) askHandler(parentCtx context.Context, askCh chan protocol.AskResp) tools.QuestionHandler {
	return func(hctx context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
		c.setAskChannel(askCh)
		defer c.clearAskChannel()
		c.sendEnvelope(protocol.NewEnvelope(protocol.TypeAskReq, protocol.AskReq{Question: rq.Question, Options: rq.Options}))
		c.hub.logger().Info("engine ask sent, awaiting client", "question", rq.Question)
		select {
		case resp := <-askCh:
			return tools.AskResponse{Selected: resp.Selected, Answer: resp.Answer, Label: resp.Label}, nil
		case <-hctx.Done():
			return tools.AskResponse{}, hctx.Err()
		case <-parentCtx.Done():
			return tools.AskResponse{}, parentCtx.Err()
		}
	}
}
