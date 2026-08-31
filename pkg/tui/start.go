package tui

import (
	"context"
	"fmt"

	tea "github.com/charmbracelet/bubbletea"

	"excelsior/pkg/agent"
	"excelsior/pkg/engine"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/tools"
)

func waitForChunk(ch <-chan agent.StreamEvent) tea.Cmd {
	return func() tea.Msg {
		ev, ok := <-ch
		if !ok {
			return streamDoneMsg{}
		}
		return streamChunkMsg{ev: ev}
	}
}

func (m model) startAgent(prompt string) (tea.Model, tea.Cmd) {
	ctx, cancel := context.WithCancel(context.TODO())
	m.cancel = cancel
	m.streaming = true
	m.pendingPrompt = prompt
	m.streamText.Reset()
	m.streamThink.Reset()
	m.blocks = append(m.blocks, block{Role: "assistant", Content: ""})

	msgs := append([]llm.Message(nil), m.cfg.History...)
	msgs = append(msgs, llm.Message{Role: "user", Content: prompt})

	ch := make(chan agent.StreamEvent, 128)
	m.streamCh = ch

	var handler tools.QuestionHandler
	if m.cfg.AskDispatcher != nil {
		handler = m.cfg.AskDispatcher.Handler(ctx)
	} else {
		handler = func(hctx context.Context, req tools.AskRequest) (tools.AskResponse, error) {
			return tools.AskResponse{}, fmt.Errorf("no ask dispatcher configured")
		}
	}
	var permHandler tools.PermissionHandler
	permMode := m.cfg.Permission
	if permMode == "allow" {
		permHandler = func(hctx context.Context, req tools.PermissionRequest) (tools.PermissionResponse, error) {
			return tools.PermissionResponse{Approved: true}, nil
		}
	} else if permMode == "deny" {
		permHandler = func(hctx context.Context, req tools.PermissionRequest) (tools.PermissionResponse, error) {
			return tools.PermissionResponse{Approved: false}, nil
		}
	} else if m.cfg.PermissionDispatcher != nil {
		permHandler = m.cfg.PermissionDispatcher.Handler(ctx)
	} else {
		permHandler = func(hctx context.Context, req tools.PermissionRequest) (tools.PermissionResponse, error) {
			return tools.PermissionResponse{Approved: false}, fmt.Errorf("no permission dispatcher configured")
		}
	}

	if m.cfg.EngineURL != "" {
		wsClient := &engine.WSClient{URL: m.cfg.EngineURL}
		go func() {
			chatReq := protocol.ChatReq{Model: m.cfg.Model, Messages: msgs}
			err := wsClient.StreamRemote(ctx, chatReq, func(d protocol.Delta) error {
				ev := agent.StreamEvent{
					Type: d.Type, Text: d.Text, Reasoning: d.Reasoning,
					ToolName: d.ToolName, ToolCallID: d.ToolCallID, ToolArgs: d.ToolArgs,
					ToolResult: d.ToolResult, FinishReason: d.FinishReason,
				}
				select {
				case ch <- ev:
				case <-ctx.Done():
					return ctx.Err()
				}
				return nil
			}, handler, permHandler)
			if err != nil {
				select {
				case ch <- agent.StreamEvent{Type: "error", Text: err.Error()}:
				case <-ctx.Done():
				}
			}
			close(ch)
		}()
		return m, waitForChunk(ch)
	}

	if m.cfg.Agent == nil {
		m.blocks = append(m.blocks, block{Role: "error", Content: "agent not configured (DEEPSEEK_API_KEY missing?)"})
		m.syncViewport()
		return m, nil
	}

	ctxWithPerm := tools.WithPermissionHandler(ctx, permHandler)
	ctxWithHandler := tools.WithQuestionHandler(ctxWithPerm, handler)
	go func() {
		_, err := m.cfg.Agent.RunWithHistory(ctxWithHandler, agent.RunOptions{
			Messages: msgs,
			OnEvent: func(ev agent.StreamEvent) {
				select {
				case ch <- ev:
				case <-ctx.Done():
				}
			},
		})
		if err != nil {
			select {
			case ch <- agent.StreamEvent{Type: "error", Text: err.Error()}:
			case <-ctx.Done():
			}
		}
		close(ch)
	}()

	return m, waitForChunk(ch)
}
