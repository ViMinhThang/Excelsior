package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"excelsior/pkg/agent"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/tools"
)

func (c *Conn) handleChat(ctx context.Context, env protocol.Envelope) {
	raw, _ := json.Marshal(env.Payload)
	var req protocol.ChatReq
	if err := json.Unmarshal(raw, &req); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad chat.req: %v", err))
		return
	}

	askRespCh := make(chan protocol.AskResp, 1)

	handler := func(hctx context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
		c.setAskChannel(askRespCh)
		defer c.clearAskChannel()

		askEnv := protocol.Envelope{
			Ver:  protocol.Ver,
			Type: protocol.TypeAskReq,
			Payload: protocol.AskReq{
				Question: rq.Question,
				Options:  rq.Options,
			},
		}
		c.sendEnvelope(askEnv)
		c.hub.logger().Info("engine ask sent, awaiting client", "question", rq.Question)

		select {
		case resp := <-askRespCh:
			return tools.AskResponse{Selected: resp.Selected, Answer: resp.Answer, Label: resp.Label}, nil
		case <-hctx.Done():
			return tools.AskResponse{}, hctx.Err()
		case <-ctx.Done():
			return tools.AskResponse{}, ctx.Err()
		}
	}

	client := &llm.Client{
		APIKey:  c.hub.Config.APIKey,
		BaseURL: c.hub.Config.BaseURL,
		Model:   req.Model,
		Logger:  c.hub.logger(),
	}
	if client.Model == "" {
		client.Model = c.hub.Config.Model
	}
	if client.Model == "" {
		client.Model = "deepseek-v4-flash"
	}

	wsDir := c.currentWorkspace()
	ag := &agent.Agent{
		LLM:    client,
		Tools:  tools.DefaultRegistry(wsDir),
		System: agent.DefaultSystemPrompt,
		Logger: c.hub.logger(),
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("%d", time.Now().UnixMilli())
	}

	var history []llm.Message
	if msgs, err := c.sessionStore().LoadSimple(sessionID); err == nil {
		for _, m := range msgs {
			if m.Role == "system" && (m.Content == "New session" || m.Content == "(empty)") {
				continue
			}
			history = append(history, m)
		}
	}
	history = append(history, req.Messages...)

	ctxWithHandler := tools.WithQuestionHandler(ctx, handler)

	res, err := ag.RunWithHistory(ctxWithHandler, agent.RunOptions{
		Messages: history,
		OnEvent: func(ev agent.StreamEvent) {
			d := protocol.Delta{
				Type:         ev.Type,
				Text:         ev.Text,
				Reasoning:    ev.Reasoning,
				ToolName:     ev.ToolName,
				ToolCallID:   ev.ToolCallID,
				ToolArgs:     ev.ToolArgs,
				ToolResult:   ev.ToolResult,
				FinishReason: ev.FinishReason,
			}
			c.sendEnvelope(protocol.Envelope{Ver: protocol.Ver, Type: protocol.TypeDelta, Payload: d})
		},
	})
	if err != nil {
		c.sendError(env.ID, err.Error())
		return
	}

	if res != nil && len(res.Messages) > 0 {
		var toSave []llm.Message
		for _, m := range res.Messages {
			if m.Role == "system" {
				continue
			}
			toSave = append(toSave, m)
		}
		if saveErr := c.sessionStore().SaveSimple(sessionID, toSave); saveErr != nil {
			c.hub.logger().Warn("failed to save session history", "id", sessionID, "err", saveErr)
		} else {
			c.hub.logger().Info("saved session history", "id", sessionID, "messages", len(toSave))
		}
	}

	c.sendEnvelope(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      env.ID,
		Type:    protocol.TypeDone,
		Payload: map[string]string{"sessionId": sessionID},
	})
}
