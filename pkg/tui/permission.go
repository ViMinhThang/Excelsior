package tui

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"excelsior/pkg/tools"
	"excelsior/pkg/util"
)

// PermissionDispatcher coordinates permission prompts between agent and UI.
type PermissionDispatcher struct {
	sink atomic.Pointer[UISink]
}

// NewPermissionDispatcher creates a fresh dispatcher.
func NewPermissionDispatcher() *PermissionDispatcher { return &PermissionDispatcher{} }

// SetSink attaches active UI sink.
func (d *PermissionDispatcher) SetSink(sink UISink) {
	if sink == nil {
		d.sink.Store(nil)
		return
	}
	d.sink.Store(&sink)
}

// Handler returns a PermissionHandler bridging to UI sink.
func (d *PermissionDispatcher) Handler(parentCtx context.Context) tools.PermissionHandler {
	return dispatchViaSink(&d.sink, parentCtx, func(req tools.PermissionRequest, ch chan tools.PermissionResponse) tea.Msg {
		return permissionRequestMsg{Req: req, RespChan: ch}
	}) // ponytail: reuse generic dispatcher
}

type permissionRequestMsg struct {
	Req      tools.PermissionRequest
	RespChan chan tools.PermissionResponse
}

type permissionOverlay struct {
	req      tools.PermissionRequest
	respChan chan tools.PermissionResponse
	cursor   int // 0 = Allow, 1 = Deny
}

func newPermissionOverlay(req tools.PermissionRequest, ch chan tools.PermissionResponse) *permissionOverlay {
	return &permissionOverlay{req: req, respChan: ch, cursor: 1}
}

func (p *permissionOverlay) View(width int) string {
	w := 70
	if width-8 < w {
		w = width - 8
		if w < 50 {
			w = 50
		}
	}
	var b strings.Builder
	title := " Permission required "
	if p.req.Tool == "bash" {
		title = " Allow bash command? "
	} else {
		title = fmt.Sprintf(" Allow %s? ", p.req.Tool)
	}
	b.WriteString(titleStyle.Render(title) + "\n\n")
	if p.req.FilePath != "" {
		b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("252")).Render("File: ") + lipgloss.NewStyle().Bold(true).Render(p.req.FilePath) + "\n")
	}
	if p.req.Command != "" {
		b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("252")).Render("Command: ") + lipgloss.NewStyle().Bold(true).Render(truncatePreview(p.req.Command, 500)) + "\n")
	}
	if p.req.Preview != "" && p.req.Tool != "bash" {
		preview := truncatePreview(p.req.Preview, 600)
		b.WriteString("\n" + lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("240")).Padding(0, 1).Width(w-6).Render(preview) + "\n")
	}
	b.WriteString("\n")
	options := []string{"Allow", "Deny"}
	for i, opt := range options {
		prefix := "  "
		style := lipgloss.NewStyle().Foreground(lipgloss.Color("252"))
		if i == p.cursor {
			prefix = "▸ "
			style = lipgloss.NewStyle().Foreground(lipgloss.Color("15")).Bold(true).Background(lipgloss.Color("236"))
		}
		b.WriteString(prefix + style.Render(opt) + "\n")
	}
	b.WriteString("\n" + helpStyle.Render("←→/Tab move • Enter confirm • y/n • Esc deny") + "\n")
	b.WriteString(helpStyle.Render("Once per call, sequentially"))
	content := b.String()
	box := lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("214")).Padding(1, 2).Width(w).Render(content)
	return lipgloss.Place(width, 18, lipgloss.Center, lipgloss.Center, box)
}

func truncatePreview(s string, n int) string { return util.Truncate(s, n) }
