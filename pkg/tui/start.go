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

	handler := m.resolveAskHandler(ctx)
	permHandler := m.resolvePermHandler(ctx)

	if m.cfg.EngineURL == "" {
		m.blocks = append(m.blocks, block{Role: "error", Content: "engine not configured"})
		m.syncViewport()
		return m, nil
	}
	m.launch(ctx, msgs, ch, handler, permHandler)
	return m, waitForChunk(ch)
}

func (m model) resolveAskHandler(ctx context.Context) tools.QuestionHandler {
	if m.cfg.AskDispatcher != nil {
		return m.cfg.AskDispatcher.Handler(ctx)
	}
	return func(hctx context.Context, req tools.AskRequest) (tools.AskResponse, error) {
		return tools.AskResponse{}, fmt.Errorf("no ask dispatcher configured")
	}
}

// resolvePermHandler always dispatches to the overlay: the engine has already
// resolved the permission mode (flag override + settings) before asking.
func (m model) resolvePermHandler(ctx context.Context) tools.PermissionHandler {
	if m.cfg.PermissionDispatcher != nil {
		return m.cfg.PermissionDispatcher.Handler(ctx)
	}
	return func(hctx context.Context, req tools.PermissionRequest) (tools.PermissionResponse, error) {
		return tools.PermissionResponse{Approved: false}, fmt.Errorf("no permission dispatcher configured")
	}
}

// ponytail: remote-only; local runs go through embedded engine (see cmd/tui.go)
func (m model) launch(ctx context.Context, msgs []llm.Message, ch chan agent.StreamEvent, handler tools.QuestionHandler, permHandler tools.PermissionHandler) {
	go func() {
		chatReq := protocol.ChatReq{Model: m.cfg.Model, Messages: msgs}
		err := (&engine.WSClient{URL: m.cfg.EngineURL}).StreamRemote(ctx, chatReq, deltaToEventForwarder(ctx, ch), handler, permHandler)
		if err != nil {
			sendErrorEvent(ctx, ch, err)
		}
		close(ch)
	}()
}

func deltaToEventForwarder(ctx context.Context, ch chan agent.StreamEvent) func(protocol.Delta) error {
	return func(d protocol.Delta) error {
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
	}
}

func sendErrorEvent(ctx context.Context, ch chan agent.StreamEvent, err error) {
	select {
	case ch <- agent.StreamEvent{Type: "error", Text: err.Error()}:
	case <-ctx.Done():
	}
}
