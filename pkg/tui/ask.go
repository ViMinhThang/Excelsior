package tui

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"excelsior/pkg/tools"
)

// UISink defines the interface for delivering messages to an interactive UI event loop.
type UISink interface {
	Send(msg tea.Msg)
}

// AskDispatcher coordinates between background agent tool execution and the interactive UI.
type AskDispatcher struct {
	sink atomic.Pointer[UISink]
}

// NewAskDispatcher creates a fresh dispatcher instance.
func NewAskDispatcher() *AskDispatcher {
	return &AskDispatcher{}
}

// SetSink attaches the active UI message sink.
func (d *AskDispatcher) SetSink(sink UISink) {
	if sink == nil {
		d.sink.Store(nil)
		return
	}
	d.sink.Store(&sink)
}

// Handler returns a QuestionHandler that bridges tool requests to the UI sink.
func (d *AskDispatcher) Handler(parentCtx context.Context) tools.QuestionHandler {
	return func(hctx context.Context, req tools.AskRequest) (tools.AskResponse, error) {
		sinkPtr := d.sink.Load()
		if sinkPtr == nil || *sinkPtr == nil {
			return tools.AskResponse{}, fmt.Errorf("no active TUI sink")
		}
		respCh := make(chan tools.AskResponse, 1)
		(*sinkPtr).Send(askRequestMsg{Req: req, RespChan: respCh})
		select {
		case resp := <-respCh:
			return resp, nil
		case <-hctx.Done():
			return tools.AskResponse{}, hctx.Err()
		case <-parentCtx.Done():
			return tools.AskResponse{}, parentCtx.Err()
		}
	}
}

// askRequestMsg is sent from the agent goroutine (via QuestionHandler) to the Bubble Tea program.
type askRequestMsg struct {
	Req      tools.AskRequest
	RespChan chan tools.AskResponse
}

// askOverlay is the interactive prompt shown when the agent calls askQuestion.
type askOverlay struct {
	req      tools.AskRequest
	respChan chan tools.AskResponse
	cursor   int // 0..2 options, 3 = manual input
	input    textinput.Model
}

func newAskOverlay(req tools.AskRequest, ch chan tools.AskResponse) *askOverlay {
	ti := textinput.New()
	ti.Placeholder = "Type your answer…"
	ti.Prompt = "› "
	ti.CharLimit = 500
	ti.Width = 40
	ti.TextStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("252"))
	ti.PlaceholderStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	ti.Focus()
	return &askOverlay{req: req, respChan: ch, cursor: 0, input: ti}
}

func (a *askOverlay) View(width int) string {
	w := 60
	if width-8 < w {
		w = width - 8
		if w < 40 {
			w = 40
		}
	}
	var b strings.Builder
	b.WriteString(titleStyle.Render(" "+a.req.Question) + "\n\n")
	for i, opt := range a.req.Options {
		prefix := "  "
		style := lipgloss.NewStyle().Foreground(lipgloss.Color("252"))
		if i == a.cursor {
			prefix = "▸ "
			style = lipgloss.NewStyle().Foreground(lipgloss.Color("15")).Bold(true).Background(lipgloss.Color("236"))
		}
		label := prefix + lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render(string(rune('1'+i))+". ") + style.Render(opt)
		b.WriteString(label + "\n")
	}
	b.WriteString("\n")
	inputLabel := "  "
	inputView := a.input.View()
	if a.cursor == 3 {
		inputLabel = "▸ "
		inputView = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("252")).Padding(0, 1).Render(inputView)
	} else {
		inputView = lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render("  " + inputView)
	}
	b.WriteString(inputLabel + helpStyle.Render("or type:") + "\n" + inputView + "\n\n")
	b.WriteString(helpStyle.Render("↑↓/Tab move • Enter select • Esc cancel"))
	content := b.String()
	box := lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("252")).Padding(1, 2).Width(w).Render(content)
	return lipgloss.Place(width, 14, lipgloss.Center, lipgloss.Center, box)
}
