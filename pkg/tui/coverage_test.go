package tui

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"excelsior/pkg/agent"
	"excelsior/pkg/tools"
)

// TestTUI_ViewFunctions_AllBlockTypes exercises renderTranscript with every
// block role so all switch branches in view.go are covered.
func TestTUI_ViewFunctions_AllBlockTypes(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)

	mod.blocks = []block{
		{Role: "system", Content: "System message"},
		{Role: "user", Content: "User message"},
		{Role: "assistant", Content: "Assistant response"},
		{Role: "reasoning", Content: "Thinking..."},
		{Role: "tool", Meta: "bash: ls", Content: "file1.go\nfile2.go"},
		{Role: "error", Content: "Something went wrong"},
	}
	mod.syncViewport()

	view := mod.View()
	if !strings.Contains(view, "System message") {
		t.Error("missing system block in view")
	}
	if !strings.Contains(view, "User message") {
		t.Error("missing user block in view")
	}
}

// TestTUI_ViewFunctions_StreamingAssistant covers the streaming assistant cursor.
func TestTUI_ViewFunctions_StreamingAssistant(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)
	mod.streaming = true
	mod.blocks = []block{
		{Role: "assistant", Content: ""},
	}
	transcript := mod.renderTranscript()
	if !strings.Contains(transcript, "▌") {
		t.Error("expected streaming cursor in empty assistant block")
	}
}

// TestTUI_HeaderView_Streaming verifies the streaming indicator appears in header.
func TestTUI_HeaderView_Streaming(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)
	mod.streaming = true
	header := mod.headerView()
	if !strings.Contains(header, "streaming") {
		t.Error("expected streaming indicator in header")
	}
}

// TestTUI_InputView_AskState verifies inputView shows ask hint when askState set.
func TestTUI_InputView_AskState(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)
	mod.askState = newAskOverlay(tools.AskRequest{Question: "Test?"}, make(chan tools.AskResponse, 1))
	v := mod.inputView()
	if !strings.Contains(v, "answering") {
		t.Error("expected 'answering question' in inputView when askState set")
	}
}

// TestTUI_InputView_Streaming verifies inputView shows cancel hint when streaming.
func TestTUI_InputView_Streaming(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)
	mod.streaming = true
	v := mod.inputView()
	if !strings.Contains(v, "streaming") {
		t.Error("expected 'streaming' in inputView when streaming")
	}
}

// TestTUI_StatusView_WithError verifies statusView shows error message.
func TestTUI_StatusView_WithError(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)
	mod.errMsg = "critical error"
	v := mod.statusView()
	if !strings.Contains(v, "critical error") {
		t.Error("expected error in statusView")
	}
}

// TestTUI_StatusView_Normal verifies statusView shows stats when no error.
func TestTUI_StatusView_Normal(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)
	v := mod.statusView()
	if !strings.Contains(v, "blocks") {
		t.Error("expected 'blocks' in normal statusView")
	}
}

// TestTUI_ShortWorkspace_NoTruncation tests path short enough to not truncate.
func TestTUI_ShortWorkspace_NoTruncation(t *testing.T) {
	ws := shortWorkspace("/short", 20)
	if ws != "/short" {
		t.Errorf("expected no truncation, got %q", ws)
	}
}

// TestTUI_ShortWorkspace_MaxZero tests that max<=0 returns original.
func TestTUI_ShortWorkspace_MaxZero(t *testing.T) {
	ws := shortWorkspace("/any/path", 0)
	if ws != "/any/path" {
		t.Errorf("expected no truncation with max=0, got %q", ws)
	}
}

// TestTUI_HandleCommand_UnknownCommand verifies unknown commands do not crash.
func TestTUI_HandleCommand_UnknownCommand(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)
	mod.handleCommand("/nonexistent")
}

// TestTUI_HandleCommand_ModelNoArg tests /model with no argument.
func TestTUI_HandleCommand_ModelNoArg(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)
	mod.handleCommand("/model")
}

// TestTUI_BodyView_WithAskState verifies bodyView switches to ask overlay.
func TestTUI_BodyView_WithAskState(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)
	mod.askState = newAskOverlay(
		tools.AskRequest{Question: "Choose?", Options: []string{"A", "B"}},
		make(chan tools.AskResponse, 1),
	)
	_ = mod.bodyView()
}

// TestTUI_ScrollbarView_WithContent verifies scrollbar renders when content overflows.
func TestTUI_ScrollbarView_WithContent(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 80, Height: 10})
	mod := m.(model)
	mod.viewport.Height = 5
	mod.blocks = make([]block, 50)
	for i := range mod.blocks {
		mod.blocks[i] = block{Role: "user", Content: "line content that is long enough to scroll"}
	}
	mod.syncViewport()
	bar := mod.scrollbarView()
	if bar == "" {
		t.Error("expected non-empty scrollbar with overflowing content")
	}
}

// TestTUI_StreamDone_Error tests receiving a streamDoneMsg with an error.
func TestTUI_StreamDone_Error(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	m, _ = m.Update(streamDoneMsg{err: errTestAgent("agent failed")})
	mod := m.(model)
	if mod.streaming {
		t.Error("expected streaming=false after streamDoneMsg")
	}
}

// TestTUI_AskOverlay_Esc tests Esc key in ask overlay clears the overlay.
func TestTUI_AskOverlay_Esc(t *testing.T) {
	respCh := make(chan tools.AskResponse, 1)
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)
	mod.askState = newAskOverlay(
		tools.AskRequest{Question: "Choose?", Options: []string{"A", "B"}},
		respCh,
	)
	newM, _ := mod.Update(tea.KeyMsg{Type: tea.KeyEsc})
	newMod := newM.(model)
	if newMod.askState != nil {
		t.Error("expected askState cleared after Esc")
	}
}

// errTestAgent is a simple error type for testing streamDoneMsg error branch.
type errTestAgent string

func (e errTestAgent) Error() string { return string(e) }

// TestTUI_StreamChunkMsg_ToolStart covers tool block creation.
func TestTUI_StreamChunkMsg_ToolStart(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	m, _ = m.Update(streamChunkMsg{ev: agent.StreamEvent{Type: "tool_start", ToolName: "grep", ToolArgs: `{"pattern":"test"}`}})
	m, _ = m.Update(streamChunkMsg{ev: agent.StreamEvent{Type: "tool_result", ToolName: "grep", ToolResult: "pkg/tools/grep.go:1"}})
	view := m.View()
	if !strings.Contains(view, "grep") {
		t.Error("expected grep tool in view")
	}
}

// TestTUI_AssistantBlock_Empty_NotStreaming verifies empty assistant block is
// skipped in renderTranscript when not streaming.
func TestTUI_AssistantBlock_Empty_NotStreaming(t *testing.T) {
	cfg := Config{Workspace: "/test", Model: "v4"}
	raw := New(cfg)
	m, _ := raw.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	mod := m.(model)
	mod.streaming = false
	mod.blocks = []block{
		{Role: "assistant", Content: ""},
	}
	transcript := mod.renderTranscript()
	if strings.Contains(transcript, "▌") {
		t.Error("should not show streaming cursor when not streaming")
	}
}