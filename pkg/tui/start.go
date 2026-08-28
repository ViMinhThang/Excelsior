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
	ctx, cancel := context.WithCancel(context.Background())
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

	if m.cfg.EngineURL != "" {
		wsClient := &engine.WSClient{URL: m.cfg.EngineURL}
		remoteAskHandler := func(hctx context.Context, req tools.AskRequest) (tools.AskResponse, error) {
			respCh := make(chan tools.AskResponse, 1)
			if activeProgram != nil {
				activeProgram.Send(askRequestMsg{Req: req, RespChan: respCh})
			} else {
				return tools.AskResponse{}, fmt.Errorf("no active TUI")
			}
			select {
			case resp := <-respCh:
				return resp, nil
			case <-hctx.Done():
				return tools.AskResponse{}, hctx.Err()
			case <-ctx.Done():
				return tools.AskResponse{}, ctx.Err()
			}
		}
		go func() {
			chatReq := protocol.ChatReq{Model: m.cfg.Model, Messages: msgs}
			err := wsClient.StreamRemote(ctx, chatReq, func(d protocol.Delta) error {
				ev := agent.StreamEvent{
					Type:         d.Type,
					Text:         d.Text,
					Reasoning:    d.Reasoning,
					ToolName:     d.ToolName,
					ToolCallID:   d.ToolCallID,
					ToolArgs:     d.ToolArgs,
					ToolResult:   d.ToolResult,
					FinishReason: d.FinishReason,
				}
				select {
				case ch <- ev:
				case <-ctx.Done():
					return ctx.Err()
				}
				return nil
			}, remoteAskHandler)
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

	handler := func(hctx context.Context, req tools.AskRequest) (tools.AskResponse, error) {
		respCh := make(chan tools.AskResponse, 1)
		if activeProgram != nil {
			activeProgram.Send(askRequestMsg{Req: req, RespChan: respCh})
		} else {
			return tools.AskResponse{}, fmt.Errorf("no active TUI")
		}
		select {
		case resp := <-respCh:
			return resp, nil
		case <-hctx.Done():
			return tools.AskResponse{}, hctx.Err()
		case <-ctx.Done():
			return tools.AskResponse{}, ctx.Err()
		}
	}
	ctxWithHandler := tools.WithQuestionHandler(ctx, handler)

	go func() {
		_, err := m.cfg.Agent.Run(ctxWithHandler, agent.RunOptions{
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


