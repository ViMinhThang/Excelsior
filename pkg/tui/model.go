package tui

import (
	"context"
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"

	"excelsior/pkg/agent"
	"excelsior/pkg/llm"
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
	textarea textarea.Model
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
}

func New(cfg Config) tea.Model {
	ta := textarea.New()
	ta.Placeholder = "Ask anything — Enter to send, Ctrl+J for newline, Ctrl+C to quit…"
	ta.Focus()
	ta.CharLimit = 0
	ta.SetHeight(3)
	ta.ShowLineNumbers = false
	ta.Prompt = "❯ "

	vp := viewport.New(0, 0)
	vp.YPosition = 0

	gr, _ := glamour.NewTermRenderer(
		glamour.WithAutoStyle(),
		glamour.WithWordWrap(80),
	)

	m := model{
		cfg:         cfg,
		viewport:    vp,
		textarea:    ta,
		glam:        gr,
		streamText:  &strings.Builder{},
		streamThink: &strings.Builder{},
		blocks: []block{
			{Role: "system", Content: fmt.Sprintf("Excelsior — %s  •  %s  •  deepseek-native", cfg.Model, cfg.Workspace)},
			{Role: "system", Content: helpStyle.Render("Enter: send  •  Ctrl+C: quit  •  Ctrl+L: clear  •  /clear /help /model")},
		},
	}
	m.syncViewport()
	return m
}

func (m model) Init() tea.Cmd {
	return textarea.Blink
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
		vH := m.height - 7
		if vH < 5 {
			vH = 5
		}
		m.viewport.Width = m.width - 2
		m.viewport.Height = vH
		m.textarea.SetWidth(m.width - 4)
		if m.width > 20 {
			if gr, err := glamour.NewTermRenderer(glamour.WithAutoStyle(), glamour.WithWordWrap(m.width-6)); err == nil {
				m.glam = gr
			}
		}
		m.syncViewport()

	case tea.KeyMsg:
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
		case "ctrl+j":
			// insert newline in textarea (alternative to submit)
			m.textarea.InsertString("\n")
			return m, nil
		case "enter":
			val := strings.TrimSpace(m.textarea.Value())
			if val == "" {
				return m, nil
			}
			if strings.HasPrefix(val, "/") {
				m.handleCommand(val)
				m.textarea.Reset()
				m.syncViewport()
				return m, nil
			}
			m.blocks = append(m.blocks, block{Role: "user", Content: val})
			m.textarea.Reset()
			m.syncViewport()
			return m.startAgent(val)
		}

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
		// keep polling for next chunk while streaming
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
		m.textarea.Focus()
		m.syncViewport()
		return m, textarea.Blink
	}

	// delegate to textarea when not streaming
	if !m.streaming {
		var cmd tea.Cmd
		m.textarea, cmd = m.textarea.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m *model) upsertAssistant() {
	// merge consecutive assistant text into one block tail
	if len(m.blocks) > 0 && m.blocks[len(m.blocks)-1].Role == "assistant" {
		m.blocks[len(m.blocks)-1].Content = m.streamText.String()
	} else {
		m.blocks = append(m.blocks, block{Role: "assistant", Content: m.streamText.String()})
	}
	m.syncViewport()
}

func (m *model) upsertReasoning(delta string) {
	// reasoning shown as dim separate block that grows; collapse into one reasoning block
	if len(m.blocks) > 0 && m.blocks[len(m.blocks)-1].Role == "reasoning" {
		m.blocks[len(m.blocks)-1].Content += delta
	} else if delta != "" {
		// if last is assistant being streamed, insert reasoning before it? Keep appended.
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

	go func() {
		_, err := m.cfg.Agent.Run(ctx, agent.RunOptions{
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

// Render

func (m model) View() string {
	if m.width == 0 {
		return "loading…"
	}
	// Build header
	header := titleStyle.Render(" excelsior ") + statusStyle.Render(fmt.Sprintf(" %s • %s ", m.cfg.Model, m.cfg.Workspace))
	if m.streaming {
		header += toolStyle.Render(" ● streaming… (esc to cancel)")
	}
	headerBox := borderStyle.Width(m.width - 2).Render(header)

	// transcript
	transcript := m.renderTranscript()

	m.viewport.SetContent(transcript)
	m.viewport.Width = m.width - 2

	// input
	inputView := m.textarea.View()
	if m.streaming {
		inputView = helpStyle.Render("  streaming… press esc to cancel")
	}
	status := statusStyle.Render(fmt.Sprintf(" %d blocks  •  %d history msgs ", len(m.blocks), len(m.cfg.History)))
	if m.errMsg != "" {
		status = errorStyle.Render(m.errMsg)
	}

	return headerBox + "\n" + m.viewport.View() + "\n" + borderStyle.Width(m.width-2).Render(inputView) + "\n" + status
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
			// glamour render if looks like markdown
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
			sb.WriteString(meta + "\n" + toolArgStyle.Render(body) + "\n")
			_ = toolResStyle
			sb.WriteString("\n")
		case "error":
			sb.WriteString(errorStyle.Render("✖ " + b.Content) + "\n\n")
		}
	}
	return sb.String()
}

func (m *model) syncViewport() {
	// viewport helper: re-render and go to bottom
	m.viewport.SetContent(m.renderTranscript())
	m.viewport.GotoBottom()
}
