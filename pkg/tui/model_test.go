package tui

import (
	"context"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"excelsior/pkg/agent"
	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

func TestTUI_NewAndInit(t *testing.T) {
	cfg := Config{
		Workspace: "/test/workspace",
		Model:     "deepseek-v4-flash",
	}
	m := New(cfg)
	if m == nil {
		t.Fatal("expected non-nil model from New")
	}

	cmd := m.Init()
	if cmd == nil {
		t.Fatal("expected non-nil cmd from Init")
	}
}

func TestTUI_WindowSizeAndRender(t *testing.T) {
	cfg := Config{
		Workspace: "/test/workspace",
		Model:     "deepseek-v4-flash",
	}
	m := New(cfg)

	// Loading state before window size is received
	if view := m.View(); view != "loading…" {
		t.Fatalf("expected 'loading…', got %q", view)
	}

	// Send WindowSizeMsg
	newModel, _ := m.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	view := newModel.View()
	if !strings.Contains(view, "excelsior") || !strings.Contains(view, "deepseek-v4-flash") {
		t.Fatalf("rendered view does not contain expected header components: %s", view)
	}
}

func TestTUI_Commands(t *testing.T) {
	cfg := Config{
		Workspace: "/test/workspace",
		Model:     "deepseek-v4-flash",
	}
	rawModel := New(cfg)
	m, _ := rawModel.(model)

	// /help command
	m.handleCommand("/help")
	if len(m.blocks) < 3 || !strings.Contains(m.blocks[len(m.blocks)-1].Content, "Commands:") {
		t.Errorf("expected /help output in blocks: %+v", m.blocks)
	}

	// /model command
	m.handleCommand("/model deepseek-v4-pro")
	if m.cfg.Model != "deepseek-v4-pro" {
		t.Errorf("expected model changed to deepseek-v4-pro, got %s", m.cfg.Model)
	}

	// /clear command
	m.handleCommand("/clear")
	if len(m.blocks) != 2 {
		t.Errorf("expected 2 blocks after /clear, got %d", len(m.blocks))
	}
}

func TestTUI_StreamChunkAndDone(t *testing.T) {
	cfg := Config{
		Workspace: "/test/workspace",
		Model:     "deepseek-v4-flash",
	}
	rawModel := New(cfg)
	m, _ := rawModel.Update(tea.WindowSizeMsg{Width: 100, Height: 30})

	// 1. Text chunk
	m, _ = m.Update(streamChunkMsg{ev: agent.StreamEvent{Type: "text", Text: "Hello"}})
	m, _ = m.Update(streamChunkMsg{ev: agent.StreamEvent{Type: "text", Text: " world!"}})

	// 2. Reasoning chunk
	m, _ = m.Update(streamChunkMsg{ev: agent.StreamEvent{Type: "reasoning", Reasoning: "Thinking deeply..."}})

	// 3. Tool start and result
	m, _ = m.Update(streamChunkMsg{ev: agent.StreamEvent{Type: "tool_start", ToolName: "view", ToolArgs: `{"filePath":"main.go"}`}})
	m, _ = m.Update(streamChunkMsg{ev: agent.StreamEvent{Type: "tool_result", ToolName: "view", ToolResult: "package main"}})

	// 4. Error chunk
	m, _ = m.Update(streamChunkMsg{ev: agent.StreamEvent{Type: "error", Text: "something failed"}})

	// 5. Done chunk
	m, _ = m.Update(streamDoneMsg{err: nil})

	view := m.View()
	if !strings.Contains(view, "Hello world!") {
		t.Errorf("view missing streaming text: %s", view)
	}
	if !strings.Contains(view, "Thinking deeply...") {
		t.Errorf("view missing reasoning: %s", view)
	}
	if !strings.Contains(view, "view") || !strings.Contains(view, "package main") {
		t.Errorf("view missing tool info: %s", view)
	}
}

func TestTUI_KeyHandling(t *testing.T) {
	cfg := Config{
		Workspace: "/test/workspace",
		Model:     "deepseek-v4-flash",
	}
	rawModel := New(cfg)
	m, _ := rawModel.Update(tea.WindowSizeMsg{Width: 100, Height: 30})

	// Ctrl+L clears history
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyCtrlL})
	mod := m.(model)
	if len(mod.blocks) != 2 {
		t.Errorf("expected 2 blocks after Ctrl+L, got %d", len(mod.blocks))
	}

	// Ctrl+C quits
	_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyCtrlC})
	if cmd == nil {
		t.Fatal("expected quit cmd on ctrl+c")
	}
}

func TestTUI_AskOverlayInteraction(t *testing.T) {
	respCh := make(chan tools.AskResponse, 1)
	req := tools.AskRequest{
		Question: "Which database?",
		Options:  []string{"Postgres", "SQLite", "MySQL"},
	}

	cfg := Config{
		Workspace: "/test/workspace",
		Model:     "deepseek-v4-flash",
	}
	rawModel := New(cfg)
	m, _ := rawModel.Update(tea.WindowSizeMsg{Width: 100, Height: 30})

	// Receive ask request
	m, _ = m.Update(askRequestMsg{Req: req, RespChan: respCh})
	mod := m.(model)
	if mod.askState == nil {
		t.Fatal("expected askState overlay to be active")
	}

	// Press '2' to select second option
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'2'}})

	select {
	case resp := <-respCh:
		if resp.Selected != 1 || resp.Answer != "SQLite" {
			t.Fatalf("unexpected ask response: %+v", resp)
		}
	default:
		t.Fatal("expected response sent on respCh")
	}
}

func TestTUI_ShortWorkspaceAndScrollbar(t *testing.T) {
	ws := shortWorkspace("/home/user/projects/excelsior", 15)
	if !strings.HasPrefix(ws, "…") {
		t.Errorf("expected truncated workspace with ellipsis, got %s", ws)
	}

	cfg := Config{Workspace: "/test", Model: "v4"}
	rawModel := New(cfg)
	m, _ := rawModel.Update(tea.WindowSizeMsg{Width: 80, Height: 24})
	mod := m.(model)
	bar := mod.scrollbarView()
	if bar == "" {
		t.Error("expected non-empty scrollbarView")
	}
}

type mockTUIRunner struct {
	events []agent.StreamEvent
}

func (r *mockTUIRunner) RunWithHistory(ctx context.Context, opts agent.RunOptions) (*agent.RunResult, error) {
	for _, ev := range r.events {
		if opts.OnEvent != nil {
			opts.OnEvent(ev)
		}
	}
	return &agent.RunResult{
		FinalMessage: &llm.Message{Role: "assistant", Content: "Done"},
		Messages:     opts.Messages,
	}, nil
}

func TestTUI_StartAgent_NilAndMock(t *testing.T) {
	// 1. Nil agent
	cfgNil := Config{Workspace: "/test", Model: "v4"}
	rawModel := New(cfgNil)
	m, _ := rawModel.Update(tea.WindowSizeMsg{Width: 80, Height: 24})
	mNil, _ := m.(model).startAgent("hello")
	modNil := mNil.(model)
	if len(modNil.blocks) < 3 || !strings.Contains(modNil.blocks[len(modNil.blocks)-1].Content, "agent not configured") {
		t.Errorf("expected agent not configured error block: %+v", modNil.blocks)
	}

	// 2. Mock agent
	runner := &mockTUIRunner{
		events: []agent.StreamEvent{
			{Type: "text", Text: "Chunk 1"},
		},
	}
	cfgMock := Config{Workspace: "/test", Model: "v4", Agent: runner, AskDispatcher: NewAskDispatcher()}
	rawMock := New(cfgMock)
	mMock, _ := rawMock.Update(tea.WindowSizeMsg{Width: 80, Height: 24})
	mStarted, cmd := mMock.(model).startAgent("hello")
	if cmd == nil {
		t.Fatal("expected non-nil cmd from startAgent")
	}
	_ = mStarted
}

func TestTUI_WaitForChunk(t *testing.T) {
	ch := make(chan agent.StreamEvent, 1)
	ch <- agent.StreamEvent{Type: "text", Text: "hi"}
	cmd := waitForChunk(ch)
	msg := cmd()
	if chunkMsg, ok := msg.(streamChunkMsg); !ok || chunkMsg.ev.Text != "hi" {
		t.Errorf("unexpected msg from waitForChunk: %+v", msg)
	}

	close(ch)
	cmdDone := waitForChunk(ch)
	msgDone := cmdDone()
	if _, ok := msgDone.(streamDoneMsg); !ok {
		t.Errorf("expected streamDoneMsg, got %+v", msgDone)
	}
}

func TestTUI_InteractiveInputAndCancel(t *testing.T) {
	runner := &mockTUIRunner{}
	cfg := Config{Workspace: "/test", Model: "v4", Agent: runner}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})

	// 1. Enter key with text in input
	mod := m.(model)
	mod.input.SetValue("explain project architecture")
	m2, cmd := mod.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("expected non-nil cmd on enter")
	}
	mod2 := m2.(model)
	if !mod2.streaming {
		t.Error("expected streaming to be true after enter")
	}

	// 2. Esc key cancels streaming
	m3, _ := mod2.Update(tea.KeyMsg{Type: tea.KeyEsc})
	mod3 := m3.(model)
	if mod3.streaming {
		t.Error("expected streaming to be false after esc")
	}
	lastBlock := mod3.blocks[len(mod3.blocks)-1]
	if lastBlock.Content != "[cancelled]" {
		t.Errorf("expected [cancelled] block, got %s", lastBlock.Content)
	}

	// 3. Navigation / Scrolling keys
	scrollKeys := []tea.KeyMsg{
		{Type: tea.KeyPgUp},
		{Type: tea.KeyPgDown},
		{Type: tea.KeyUp},
		{Type: tea.KeyDown},
		{Type: tea.KeyHome},
		{Type: tea.KeyEnd},
	}
	for _, k := range scrollKeys {
		m3, _ = m3.Update(k)
	}

	// 4. Mouse msg
	m3, _ = m3.Update(tea.MouseMsg{})

	// 5. Error in status view
	mod3.errMsg = "Critical failure"
	viewWithErr := mod3.View()
	if !strings.Contains(viewWithErr, "Critical failure") {
		t.Errorf("view missing error msg: %s", viewWithErr)
	}
}

func TestTUI_AskOverlay_CustomInput(t *testing.T) {
	respCh := make(chan tools.AskResponse, 1)
	req := tools.AskRequest{
		Question: "Which database?",
		Options:  []string{"Postgres", "SQLite", "MySQL"},
	}

	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})

	// Receive ask request
	m, _ = m.Update(askRequestMsg{Req: req, RespChan: respCh})

	// Down arrow x3 to select custom input (cursor 3)
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyDown})
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyDown})
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyDown})

	mod := m.(model)
	if mod.askState.cursor != 3 {
		t.Fatalf("expected cursor == 3, got %d", mod.askState.cursor)
	}

	// Type custom answer
	mod.askState.input.SetValue("CockroachDB")

	// Press Enter to submit custom answer
	m, _ = mod.Update(tea.KeyMsg{Type: tea.KeyEnter})

	select {
	case resp := <-respCh:
		if resp.Selected != -1 || resp.Answer != "CockroachDB" {
			t.Fatalf("unexpected custom answer response: %+v", resp)
		}
	default:
		t.Fatal("expected custom answer sent on respCh")
	}
}


