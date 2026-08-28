package tui

import (
	"context"
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"

	"excelsior/pkg/agent"
	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

// Config holds the TUI wiring. The agent is injected so the TUI is pure UI.
type Config struct {
	Agent     *agent.Agent
	Workspace string
	Model     string // for status bar
	History   []llm.Message
}

// block is a rendered turn in the transcript.
type block struct {
	Role    string // user | assistant | tool | system | error | reasoning
	Content string
	Meta    string // tool name / arg summary
}

type model struct {
	cfg      Config
	viewport viewport.Model
	input    textinput.Model
	blocks   []block
	// streaming state: accumulate assistant text + reasoning + tool calls
	// use pointers — strings.Builder must not be copied by value (bubbletea copies model on Update)
	streaming     bool
	streamText    *strings.Builder
	streamThink   *strings.Builder
	cancel        context.CancelFunc
	streamCh      <-chan agent.StreamEvent
	pendingPrompt string
	errMsg       string
	width         int
	height        int
	glam          *glamour.TermRenderer
	askState      *askOverlay
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

	gr, _ := glamour.NewTermRenderer(
		glamour.WithAutoStyle(),
		glamour.WithWordWrap(80),
	)

	m := model{
		cfg:         cfg,
		viewport:    vp,
		input:       ti,
		glam:        gr,
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
type streamDoneMsg struct{ final *llm.Message; err error }
type streamErrMsg struct{ err error }

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		// viewport = height - header(3) - inputBox(3) - status(1)
		vH := m.height - 7
		if vH < 5 {
			vH = 5
		}
		m.viewport.Width = m.width - 4 // leave room for scrollbar + border
		m.viewport.Height = vH
		m.input.Width = m.width - 6
		if m.width > 20 {
			if gr, err := glamour.NewTermRenderer(glamour.WithAutoStyle(), glamour.WithWordWrap(m.width-8)); err == nil {
				m.glam = gr
			}
		}
		m.syncViewport()

	case askRequestMsg:
		m.askState = newAskOverlay(msg.Req, msg.RespChan)
		return m, textinput.Blink

	case tea.KeyMsg:
		// If ask overlay is active, route keys there
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
		// when streaming, allow Ctrl+C to cancel
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
				return m, nil // swallow input while streaming
			}
		}

		// global shortcuts
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
			// let viewport handle history scrolling even with input focused
			var cmd tea.Cmd
			m.viewport, cmd = m.viewport.Update(msg)
			return m, cmd
		}

		// mouse wheel also falls through to viewport via MouseMsg below

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

	// delegate to input when not streaming
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
	if m.cfg.Agent == nil {
		m.blocks = append(m.blocks, block{Role: "error", Content: "agent not configured (DEEPSEEK_API_KEY missing?)"})
		m.syncViewport()
		return m, nil
	}
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

	// Interactive askQuestion handler — shows overlay and waits for user choice
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

// scrollbarView renders a vertical scrollbar for the viewport.
// Returns empty string if content fits (no scroll needed).
func (m model) scrollbarView() string {
	h := m.viewport.Height
	if h <= 0 {
		return ""
	}
	// if viewport can't scroll, hide scrollbar
	if m.viewport.TotalLineCount() <= h {
		// still render a dim track so layout stays stable, but use empty
		var sb strings.Builder
		for i := 0; i < h; i++ {
			sb.WriteString(scrollbarStyle.Render("│"))
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
	// thumb size proportional to visible ratio, min 1
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
	for i := 0; i < h; i++ {
		if i >= thumbPos && i < thumbPos+thumbSize {
			sb.WriteString(scrollbarThumbStyle.Render("█"))
		} else {
			sb.WriteString(scrollbarStyle.Render("│"))
		}
		if i < h-1 {
			sb.WriteString("\n")
		}
	}
	return sb.String()
}

// Render

func (m model) View() string {
	if m.width == 0 {
		return "loading…"
	}
	header := titleStyle.Render(" excelsior ") + statusStyle.Render(fmt.Sprintf(" %s • %s ", m.cfg.Model, m.cfg.Workspace))
	if m.streaming {
		header += toolStyle.Render(" ● streaming… (esc to cancel)")
	}
	headerBox := borderStyle.Width(m.width - 2).Render(header)

	// transcript + scrollbar (one-line prompt, viewport with scroll bar)
	m.viewport.SetContent(m.renderTranscript())
	viewportView := m.viewport.View()
	scrollbar := m.scrollbarView()
	body := lipgloss.JoinHorizontal(lipgloss.Top, viewportView, " ", scrollbar)

	// Ask overlay takes over body when active
	if m.askState != nil {
		body = m.askState.View(m.width)
	}

	// input — single line only (hidden behind ask overlay)
	var inputView string
	if m.askState != nil {
		inputView = helpStyle.Render("  answering question…")
	} else if m.streaming {
		inputView = helpStyle.Render("  streaming… press esc to cancel")
	} else {
		inputView = m.input.View()
	}
	inputBox := borderStyle.Width(m.width - 2).Render(inputView)

	status := statusStyle.Render(fmt.Sprintf(" %d blocks  •  %d history msgs  •  ↑↓/PgUp/PgDn scroll ", len(m.blocks), len(m.cfg.History)))
	if m.errMsg != "" {
		status = errorStyle.Render(m.errMsg)
	}

	return headerBox + "\n" + body + "\n" + inputBox + "\n" + status
}

func (m model) renderTranscript() string {
	var sb strings.Builder
	for _, b := range m.blocks {
		switch b.Role {
		case "system":
			sb.WriteString(helpStyle.Render("· " + b.Content) + "\n\n")
		case "user":
			sb.WriteString(userPrefix.Render("You: ") + b.Content + "\n\n")
		case "assistant":
			if strings.TrimSpace(b.Content) == "" {
				if m.streaming {
					sb.WriteString(assistantStyle.Render("▌") + "\n\n")
				}
				continue
			}
			out := b.Content
			if m.glam != nil && (strings.Contains(out, "```") || strings.Contains(out, "# ") || strings.Contains(out, "- ")) {
				if rendered, err := m.glam.Render(out); err == nil {
					out = strings.TrimSpace(rendered)
				}
			}
			sb.WriteString(assistantStyle.Render(out) + "\n\n")
		case "reasoning":
			sb.WriteString(reasonStyle.Render("… " + b.Content) + "\n\n")
		case "tool":
			meta := toolStyle.Render("◆ " + b.Meta)
			body := b.Content
			if len(body) > 800 {
				body = body[:800] + "…"
			}
			// Monochrome: white border containing tool output
			w := m.width - 8
			if w < 20 {
				w = 20
			}
			boxed := toolResStyle.Width(w).Render(toolArgStyle.Render(body))
			sb.WriteString(meta + "\n" + boxed + "\n\n")
		case "error":
			sb.WriteString(errorStyle.Render("✖ " + b.Content) + "\n\n")
		}
	}
	return sb.String()
}

func (m *model) syncViewport() {
	m.viewport.SetContent(m.renderTranscript())
	m.viewport.GotoBottom()
}
