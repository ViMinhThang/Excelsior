package engine

import (
	"context"
	"fmt"
	"time"

	"excelsior/internal/chat"
	"excelsior/internal/permissions"
	"excelsior/pkg/config"
	"excelsior/pkg/protocol"
	"excelsior/pkg/tools"
)

func (c *Conn) handleChat(ctx context.Context, env protocol.Envelope) {
	var req protocol.ChatReq
	if !c.decodePayload(env, &req, "chat.req") {
		return
	}

	ctxWithTools := c.setupToolHandlers(ctx)
	ag, err := c.getAgent(req.Model)
	if err != nil {
		c.sendError(env.ID, fmt.Sprintf("create agent: %v", err))
		return
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("%d", time.Now().UnixMilli())
	}

	c.subscribe(sessionID)
	_, err = (chat.Service{Runner: ag, Store: c.sessionStore()}).Run(ctxWithTools, chat.Request{
		SessionID: sessionID,
		Messages:  req.Messages,
		OnEvent:   c.deltaForwarder(sessionID),
	})
	if err != nil {
		c.sendError(env.ID, err.Error())
		return
	}

	c.hub.BroadcastToSession(c.userID, sessionID, protocol.NewEnvelopeWithID(env.ID, protocol.TypeDone, map[string]string{"sessionId": sessionID}))
}

func (c *Conn) setupToolHandlers(ctx context.Context) context.Context {
	askCh := make(chan protocol.AskResp, 1)
	askHandler := c.askHandler(ctx, askCh)
	permCh := make(chan protocol.PermissionResp, 1)
	permHandler := c.permissionHandler(ctx, permCh)

	ctxWithTools := tools.WithPermissionHandler(ctx, permHandler)
	return tools.WithQuestionHandler(ctxWithTools, askHandler)
}

func (c *Conn) deltaForwarder(sessionID string) func(chat.Event) {
	return func(ev chat.Event) {
		d := protocol.Delta{
			Type: ev.Type, Text: ev.Text, Reasoning: ev.Reasoning,
			ToolName: ev.ToolName, ToolCallID: ev.ToolCallID,
			ToolArgs: ev.ToolArgs, ToolResult: ev.ToolResult,
			FinishReason: ev.FinishReason,
		}
		if ev.Usage != nil {
			d.PromptTokens, d.CompletionTokens, d.TotalTokens = ev.Usage.PromptTokens, ev.Usage.CompletionTokens, ev.Usage.TotalTokens
		}
		c.hub.BroadcastToSession(c.userID, sessionID, protocol.NewEnvelope(protocol.TypeDelta, d))
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

func (c *Conn) permissionHandler(parentCtx context.Context, permCh chan protocol.PermissionResp) tools.PermissionHandler {
	return func(hctx context.Context, rq tools.PermissionRequest) (tools.PermissionResponse, error) {
		// Resolve settings for this connection without mutating shared hub config.
		perm, _ := permissions.Resolve(c.hub.Config.Permission, config.LoadSettings(c.currentWorkspace()))
		switch perm {
		case "allow":
			return tools.PermissionResponse{Approved: true}, nil
		case "deny":
			return tools.PermissionResponse{Approved: false}, nil
		}
		c.setPermChannel(permCh)
		defer c.clearPermChannel()
		c.sendEnvelope(protocol.NewEnvelope(protocol.TypePermissionReq, protocol.PermissionReq{
			Tool: rq.Tool, FilePath: rq.FilePath, Preview: rq.Preview, Command: rq.Command,
		}))
		c.hub.logger().Info("engine permission sent, awaiting client", "tool", rq.Tool, "file", rq.FilePath, "command", rq.Command)
		select {
		case resp := <-permCh:
			return tools.PermissionResponse{Approved: resp.Approved}, nil
		case <-hctx.Done():
			return tools.PermissionResponse{}, hctx.Err()
		case <-parentCtx.Done():
			return tools.PermissionResponse{}, parentCtx.Err()
		}
	}
}
