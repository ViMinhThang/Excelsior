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
	if m.askState != nil {
		body = m.askState.View(m.width)
	}
	return body
}

func (m model) inputView() string {
	var v string
	if m.askState != nil {
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
		switch b.Role {
		case "system":
			sb.WriteString(helpStyle.Render("· "+b.Content) + "\n\n")
		case "user":
			sb.WriteString(userPrefix.Render("You: ") + b.Content + "\n\n")
		case "assistant":
			if strings.TrimSpace(b.Content) == "" {
				if m.streaming {
					sb.WriteString(assistantStyle.Render("▌") + "\n\n")
				}
				continue
			}
			// Syntax-highlight fenced code blocks (```lang) via chroma
			if strings.Contains(b.Content, "```") {
				w := m.width - 8
				if w < 40 {
					w = 40
				}
				rendered := renderMarkdownWithHighlight(b.Content, w)
				sb.WriteString(rendered + "\n\n")
			} else {
				sb.WriteString(assistantStyle.Render(b.Content) + "\n\n")
			}
		case "reasoning":
			sb.WriteString(reasonStyle.Render("… "+b.Content) + "\n\n")
		case "tool":
			meta := toolStyle.Render("◆ " + b.Meta)
			body := util.Truncate(b.Content, 4000)
			w := m.width - 8
			if w < 20 {
				w = 20
			}
			// Highlight tool output: if it contains fenced code, render with markdown highlight;
			// if it looks like code (e.g. view/write output), highlight via chroma.
			var rendered string
			if strings.Contains(body, "```") {
				rendered = renderMarkdownWithHighlight(body, w)
			} else if isCodeLike(body) {
				lang := inferToolLang(body, b.Meta)
				highlighted := HighlightCode(body, lang)
				header := ""
				if lang != "" {
					header = codeHeaderStyle.Render(lang) + "\n"
				}
				rendered = header + codeBlockStyle.Width(w).Render(highlighted)
			} else {
				rendered = toolResStyle.Width(w).Render(toolArgStyle.Render(body))
			}
			sb.WriteString(meta + "\n" + rendered + "\n\n")
		case "error":
			sb.WriteString(errorStyle.Render("✖ "+b.Content) + "\n\n")
		}
	}
	return sb.String()
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
	percent := m.viewport.ScrollPercent()
	if percent < 0 {
		percent = 0
	}
	if percent > 1 {
		percent = 1
	}
	total := m.viewport.TotalLineCount()
	if total == 0 {
		total = 1
	}
	thumbSize := h * h / total
	if thumbSize < 1 {
		thumbSize = 1
	}
	if thumbSize > h {
		thumbSize = h
	}
	thumbPos := int(percent * float64(h-thumbSize))
	if thumbPos < 0 {
		thumbPos = 0
	}
	if thumbPos > h-thumbSize {
		thumbPos = h - thumbSize
	}
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
