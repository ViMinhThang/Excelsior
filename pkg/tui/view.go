package tui

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"excelsior/pkg/util"
)

func shortWorkspace(ws string, max int) string {
	if max <= 0 || len(ws) <= max {
		return ws
	}
	if i := strings.LastIndex(ws, string(filepath.Separator)); i > 0 {
		if j := strings.LastIndex(ws[:i], string(filepath.Separator)); j >= 0 {
			ws = "…" + ws[j:]
		} else {
			ws = "…" + ws[i:]
		}
	}
	if len(ws) > max {
		return "…" + ws[len(ws)-max+1:]
	}
	return ws
}

func (m model) headerView() string {
	wsShort := shortWorkspace(m.cfg.Workspace, m.width-30)
	if len(wsShort) > 40 {
		wsShort = "…" + wsShort[len(wsShort)-40:]
	}
	if wsShort == "" {
		wsShort = m.cfg.Workspace
	}
	header := titleStyle.Render(" excelsior ") + statusStyle.Render(fmt.Sprintf(" %s • %s ", m.cfg.Model, wsShort))
	if m.streaming {
		header += toolStyle.Render(" ● streaming… (esc to cancel)")
	}
	return borderStyle.Width(m.width - 2).Render(header)
}

func (m model) bodyView() string {
	viewportView := m.viewport.View()
	scrollbar := m.scrollbarView()
	body := lipgloss.JoinHorizontal(lipgloss.Top, viewportView, " ", scrollbar)
	if m.permState != nil {
		body = m.permState.View(m.width)
	} else if m.askState != nil {
		body = m.askState.View(m.width)
	}
	return body
}

func (m model) inputView() string {
	var v string
	if m.permState != nil {
		v = helpStyle.Render("  permission required — y/n, ←→, enter…")
	} else if m.askState != nil {
		v = helpStyle.Render("  answering question…")
	} else if m.streaming {
		v = helpStyle.Render("  streaming… press esc to cancel")
	} else {
		v = m.input.View()
	}
	return borderStyle.Width(m.width - 2).Render(v)
}

func (m model) statusView() string {
	if m.errMsg != "" {
		return errorStyle.Render(m.errMsg)
	}
	return statusStyle.Render(fmt.Sprintf(" %d blocks  •  %d history msgs  •  ↑↓/PgUp/PgDn scroll ", len(m.blocks), len(m.cfg.History)))
}

func (m model) View() string {
	if m.width == 0 {
		return "loading…"
	}
	return m.headerView() + "\n" + m.bodyView() + "\n" + m.inputView() + "\n" + m.statusView()
}

func (m model) renderTranscript() string {
	var sb strings.Builder
	for _, b := range m.blocks {
		if out := m.renderBlock(b); out != "" {
			sb.WriteString(out + "\n\n")
		}
	}
	return sb.String()
}

func (m model) renderBlock(b block) string {
	switch b.Role {
	case "system":
		return helpStyle.Render("· " + b.Content)
	case "user":
		return userPrefix.Render("You: ") + b.Content
	case "assistant":
		return m.renderAssistantBlock(b)
	case "reasoning":
		return reasonStyle.Render("… " + b.Content)
	case "tool":
		return m.renderToolBlock(b)
	case "error":
		return errorStyle.Render("✖ " + b.Content)
	default:
		return ""
	}
}

func (m model) renderAssistantBlock(b block) string {
	if strings.TrimSpace(b.Content) == "" {
		if m.streaming {
			return assistantStyle.Render("▌")
		}
		return ""
	}
	if strings.Contains(b.Content, "```") {
		w := m.transcriptWidth(40)
		return renderMarkdownWithHighlight(b.Content, w)
	}
	return assistantStyle.Render(b.Content)
}

func (m model) renderToolBlock(b block) string {
	meta := toolStyle.Render("◆ " + b.Meta)
	body := util.Truncate(b.Content, 4000)
	w := m.transcriptWidth(20)
	return meta + "\n" + m.renderToolBody(body, b.Meta, w)
}

func (m model) transcriptWidth(min int) int {
	w := m.width - 8
	if w < min {
		w = min
	}
	return w
}

func (m model) renderToolBody(body, meta string, w int) string {
	if strings.Contains(body, "```") {
		return renderMarkdownWithHighlight(body, w)
	}
	if isCodeLike(body) {
		return m.renderHighlightedToolBody(body, meta, w)
	}
	return toolResStyle.Width(w).Render(toolArgStyle.Render(body))
}

func (m model) renderHighlightedToolBody(body, meta string, w int) string {
	lang := inferToolLang(body, meta)
	highlighted := HighlightCode(body, lang)
	header := ""
	if lang != "" {
		header = codeHeaderStyle.Render(lang) + "\n"
	}
	return header + codeBlockStyle.Width(w).Render(highlighted)
}

func (m *model) syncViewport() {
	m.viewport.SetContent(m.renderTranscript())
	m.viewport.GotoBottom()
}

func (m model) scrollbarView() string {
	h := m.viewport.Height
	if h <= 0 {
		return ""
	}
	bar := scrollbarStyle.Render("│")
	thumb := scrollbarThumbStyle.Render("█")
	if m.viewport.TotalLineCount() <= h {
		return m.renderScrollbarFull(bar, h)
	}
	percent := clampPercent(m.viewport.ScrollPercent())
	total := m.viewport.TotalLineCount()
	if total == 0 {
		total = 1
	}
	thumbSize := calcThumbSize(h, total)
	thumbPos := calcThumbPos(percent, h, thumbSize)
	return m.renderScrollbarThumb(bar, thumb, h, thumbPos, thumbSize)
}

func (m model) renderScrollbarFull(bar string, h int) string {
	var sb strings.Builder
	sb.Grow(h * 4)
	for i := 0; i < h; i++ {
		sb.WriteString(bar)
		if i < h-1 {
			sb.WriteString("\n")
		}
	}
	return sb.String()
}

func clampPercent(p float64) float64 {
	if p < 0 {
		return 0
	}
	if p > 1 {
		return 1
	}
	return p
}

func calcThumbSize(h, total int) int {
	size := h * h / total
	if size < 1 {
		size = 1
	}
	if size > h {
		size = h
	}
	return size
}

func calcThumbPos(percent float64, h, thumbSize int) int {
	pos := int(percent * float64(h-thumbSize))
	if pos < 0 {
		pos = 0
	}
	if pos > h-thumbSize {
		pos = h - thumbSize
	}
	return pos
}

func (m model) renderScrollbarThumb(bar, thumb string, h, thumbPos, thumbSize int) string {
	var sb strings.Builder
	sb.Grow(h * 4)
	for i := 0; i < h; i++ {
		if i >= thumbPos && i < thumbPos+thumbSize {
			sb.WriteString(thumb)
		} else {
			sb.WriteString(bar)
		}
		if i < h-1 {
			sb.WriteString("\n")
		}
	}
	return sb.String()
}
