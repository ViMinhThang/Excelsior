package tui

import (
	"context"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"

	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		vH := m.height - 7
		if vH < 5 {
			vH = 5
		}
		m.viewport.Width = m.width - 4
		m.viewport.Height = vH
		m.input.Width = m.width - 6
		m.syncViewport()

	case askRequestMsg:
		m.askState = newAskOverlay(msg.Req, msg.RespChan)
		return m, textinput.Blink

	case tea.KeyMsg:
		if m.askState != nil {
			switch msg.String() {
			case "esc":
				ch := m.askState.respChan
				m.askState = nil
				m.input.Focus()
				select {
				case ch <- tools.AskResponse{Selected: -1, Answer: ""}:
				default:
				}
				return m, textinput.Blink
			case "up", "shift+tab":
				if m.askState.cursor > 0 {
					m.askState.cursor--
				}
				if m.askState.cursor == 3 {
					m.askState.input.Focus()
				} else {
					m.askState.input.Blur()
				}
				return m, nil
			case "down", "tab":
				if m.askState.cursor < 3 {
					m.askState.cursor++
				}
				if m.askState.cursor == 3 {
					m.askState.input.Focus()
				} else {
					m.askState.input.Blur()
				}
				return m, nil
			case "enter":
				var resp tools.AskResponse
				if m.askState.cursor == 3 {
					val := strings.TrimSpace(m.askState.input.Value())
					if val == "" {
						return m, nil
					}
					resp = tools.AskResponse{Selected: -1, Answer: val, Label: val}
				} else {
					opt := m.askState.req.Options[m.askState.cursor]
					resp = tools.AskResponse{Selected: m.askState.cursor, Answer: opt, Label: opt}
				}
				ch := m.askState.respChan
				m.askState = nil
				m.input.Focus()
				select {
				case ch <- resp:
				default:
				}
				return m, textinput.Blink
			case "1", "2", "3":
				idx := int(msg.String()[0] - '1')
				if idx < len(m.askState.req.Options) {
					opt := m.askState.req.Options[idx]
					resp := tools.AskResponse{Selected: idx, Answer: opt, Label: opt}
					ch := m.askState.respChan
					m.askState = nil
					m.input.Focus()
					select {
					case ch <- resp:
					default:
					}
					return m, textinput.Blink
				}
				return m, nil
			}
			if m.askState.cursor == 3 {
				var cmd tea.Cmd
				m.askState.input, cmd = m.askState.input.Update(msg)
				return m, cmd
			}
			return m, nil
		}
		if m.streaming {
			switch msg.String() {
			case "ctrl+c", "esc":
				if m.cancel != nil {
					m.cancel()
				}
				m.streaming = false
				m.blocks = append(m.blocks, block{Role: "system", Content: "[cancelled]"})
				m.syncViewport()
				return m, nil
			default:
				return m, nil
			}
		}
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "ctrl+l":
			m.blocks = m.blocks[:2]
			m.syncViewport()
			return m, nil
		case "enter":
			val := strings.TrimSpace(m.input.Value())
			if val == "" {
				return m, nil
			}
			if strings.HasPrefix(val, "/") {
				m.handleCommand(val)
				m.input.Reset()
				m.syncViewport()
				return m, nil
			}
			m.blocks = append(m.blocks, block{Role: "user", Content: val})
			m.input.Reset()
			m.syncViewport()
			return m.startAgent(val)
		case "pgup", "pgdown", "home", "end", "up", "down":
			var cmd tea.Cmd
			m.viewport, cmd = m.viewport.Update(msg)
			return m, cmd
		}

	case tea.MouseMsg:
		var cmd tea.Cmd
		m.viewport, cmd = m.viewport.Update(msg)
		return m, cmd

	case streamChunkMsg:
		ev := msg.ev
		switch ev.Type {
		case "text":
			m.streamText.WriteString(ev.Text)
			m.upsertAssistant()
		case "reasoning":
			m.streamThink.WriteString(ev.Reasoning)
			m.upsertReasoning(ev.Reasoning)
		case "tool_start":
			if ev.ToolName != "" {
				m.blocks = append(m.blocks, block{Role: "tool", Meta: ev.ToolName, Content: ev.ToolArgs})
				m.syncViewport()
			}
		case "tool_result":
			m.blocks = append(m.blocks, block{Role: "tool", Meta: ev.ToolName + " →", Content: ev.ToolResult})
			m.syncViewport()
		case "error":
			m.blocks = append(m.blocks, block{Role: "error", Content: ev.Text})
			m.syncViewport()
		}
		if m.streaming && m.streamCh != nil {
			return m, waitForChunk(m.streamCh)
		}
		return m, nil

	case streamDoneMsg:
		m.streaming = false
		m.cancel = nil
		m.streamCh = nil
		if msg.err != nil && msg.err != context.Canceled {
			m.blocks = append(m.blocks, block{Role: "error", Content: msg.err.Error()})
		} else {
			finalText := strings.TrimSpace(m.streamText.String())
			if finalText == "" {
				for i := len(m.blocks) - 1; i >= 0; i-- {
					if m.blocks[i].Role == "assistant" && strings.TrimSpace(m.blocks[i].Content) != "" {
						finalText = m.blocks[i].Content
						break
					}
				}
			}
			if m.pendingPrompt != "" {
				m.cfg.History = append(m.cfg.History, llm.Message{Role: "user", Content: m.pendingPrompt})
				m.cfg.History = append(m.cfg.History, llm.Message{Role: "assistant", Content: finalText})
			}
			m.pendingPrompt = ""
			m.streamText.Reset()
			m.streamThink.Reset()
		}
		m.input.Focus()
		m.syncViewport()
		return m, textinput.Blink
	}

	if !m.streaming {
		var cmd tea.Cmd
		m.input, cmd = m.input.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m *model) upsertAssistant() {
	if len(m.blocks) > 0 && m.blocks[len(m.blocks)-1].Role == "assistant" {
		m.blocks[len(m.blocks)-1].Content = m.streamText.String()
	} else {
		m.blocks = append(m.blocks, block{Role: "assistant", Content: m.streamText.String()})
	}
	m.syncViewport()
}

func (m *model) upsertReasoning(delta string) {
	if len(m.blocks) > 0 && m.blocks[len(m.blocks)-1].Role == "reasoning" {
		m.blocks[len(m.blocks)-1].Content += delta
	} else if delta != "" {
		m.blocks = append(m.blocks, block{Role: "reasoning", Content: delta})
	}
	m.syncViewport()
}

func (m *model) handleCommand(cmd string) {
	parts := strings.Fields(cmd)
	switch parts[0] {
	case "/clear":
		m.blocks = m.blocks[:2]
	case "/help":
		m.blocks = append(m.blocks, block{Role: "system", Content: "Commands: /clear, /help, /model [deepseek-chat|deepseek-reasoner], /quit"})
	case "/model":
		if len(parts) == 2 {
			m.cfg.Model = parts[1]
			if m.cfg.Agent != nil && m.cfg.Agent.LLM != nil {
				m.cfg.Agent.LLM.Model = parts[1]
			}
			m.blocks = append(m.blocks, block{Role: "system", Content: "Model → " + parts[1]})
		} else {
			m.blocks = append(m.blocks, block{Role: "system", Content: "Current model: " + m.cfg.Model})
		}
	case "/quit", "/exit", "/q":
		m.blocks = append(m.blocks, block{Role: "system", Content: "Use Ctrl+C to quit"})
	default:
		m.blocks = append(m.blocks, block{Role: "system", Content: "Unknown command: " + parts[0] + "  (try /help)"})
	}
}
