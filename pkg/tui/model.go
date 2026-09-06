package tui

import (
	"context"
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"excelsior/pkg/agent"
	"excelsior/pkg/llm"
)

// Config holds the TUI wiring. The TUI is pure UI: it talks to the backend
// only via EngineURL (WS). Local runs use an embedded engine (see cmd/tui.go).
// Permission mode is enforced server-side (engine resolves flag+settings);
// the TUI always surfaces the permission overlay when the engine asks.
type Config struct {
	Workspace            string
	Model                string // for status bar
	History              []llm.Message
	EngineURL            string // e.g. ws://localhost:17812/v1/ws (required)
	AskDispatcher        *AskDispatcher
	PermissionDispatcher *PermissionDispatcher
}

// block is a rendered turn in the transcript.
type block struct {
	Role    string // user | assistant | tool | system | error | reasoning
	Content string
	Meta    string // tool name / arg summary
}

type model struct {
	cfg           Config
	viewport      viewport.Model
	input         textinput.Model
	blocks        []block
	streaming     bool
	streamText    *strings.Builder
	streamThink   *strings.Builder
	cancel        context.CancelFunc
	streamCh      <-chan agent.StreamEvent
	pendingPrompt string
	errMsg        string
	width         int
	height        int
	askState      *askOverlay
	permState     *permissionOverlay
}

func New(cfg Config) tea.Model {
	ti := textinput.New()
	ti.Placeholder = "Ask anything — Enter to send, Ctrl+C to quit…"
	ti.Focus()
	ti.CharLimit = 0
	ti.Prompt = "❯ "
	ti.TextStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("15"))
	ti.PlaceholderStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))

	vp := viewport.New(0, 0)
	vp.YPosition = 0
	vp.MouseWheelEnabled = true

	m := model{
		cfg:         cfg,
		viewport:    vp,
		input:       ti,
		streamText:  &strings.Builder{},
		streamThink: &strings.Builder{},
		blocks: []block{
			{Role: "system", Content: fmt.Sprintf("Excelsior — %s  •  %s  •  deepseek-native", cfg.Model, cfg.Workspace)},
			{Role: "system", Content: helpStyle.Render("Enter: send  •  Ctrl+C: quit  •  Ctrl+L: clear  •  /clear /help /model  •  PgUp/PgDn scroll")},
		},
	}
	m.syncViewport()
	return m
}

func (m model) Init() tea.Cmd {
	return textinput.Blink
}

// Messages for streaming
type streamChunkMsg struct{ ev agent.StreamEvent }
type streamDoneMsg struct{ err error }
