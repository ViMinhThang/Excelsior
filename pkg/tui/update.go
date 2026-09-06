package tui

import (
	"context"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		return m.updateWindowSize(msg)
	case askRequestMsg:
		return m.updateAskRequest(msg)
	case permissionRequestMsg:
		return m.updatePermissionRequest(msg)
	case tea.KeyMsg:
		return m.updateKeyMsg(msg)
	case tea.MouseMsg:
		return m.updateMouseMsg(msg)
	case streamChunkMsg:
		return m.updateStreamChunk(msg)
	case streamDoneMsg:
		return m.updateStreamDone(msg)
	}
	if !m.streaming {
		var cmd tea.Cmd
		m.input, cmd = m.input.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m model) updateWindowSize(msg tea.WindowSizeMsg) (tea.Model, tea.Cmd) {
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
	return m, nil
}

func (m model) updateAskRequest(msg askRequestMsg) (tea.Model, tea.Cmd) {
	m.askState = newAskOverlay(msg.Req, msg.RespChan)
	return m, textinput.Blink
}

func (m model) updatePermissionRequest(msg permissionRequestMsg) (tea.Model, tea.Cmd) {
	m.permState = newPermissionOverlay(msg.Req, msg.RespChan)
	return m, textinput.Blink
}

func (m model) updateMouseMsg(msg tea.MouseMsg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	m.viewport, cmd = m.viewport.Update(msg)
	return m, cmd
}

func (m model) updateKeyMsg(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if m.permState != nil {
		if cmd, done := m.handlePermissionKey(msg); done {
			return m, cmd
		}
		return m, nil
	}
	if m.askState != nil {
		if cmd, done := m.handleAskKey(msg); done {
			return m, cmd
		}
		if m.askState != nil && m.askState.cursor == 3 {
			var cmd tea.Cmd
			m.askState.input, cmd = m.askState.input.Update(msg)
			return m, cmd
		}
		return m, nil
	}
	if m.streaming {
		return m.updateKeyMsgStreaming(msg)
	}
	return m.updateKeyMsgNormal(msg)
}

func (m model) updateKeyMsgStreaming(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c", "esc":
		if m.cancel != nil {
			m.cancel()
		}
		m.streaming = false
		m.blocks = append(m.blocks, block{Role: "system", Content: "[cancelled]"})
		m.syncViewport()
	}
	return m, nil
}

func (m model) updateKeyMsgNormal(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c":
		return m, tea.Quit
	case "ctrl+l":
		m.blocks = m.blocks[:2]
		m.syncViewport()
		return m, nil
	case "enter":
		return m.handleEnterKey()
	case "pgup", "pgdown", "home", "end", "up", "down":
		var cmd tea.Cmd
		m.viewport, cmd = m.viewport.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m model) handleEnterKey() (tea.Model, tea.Cmd) {
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
}

func (m model) updateStreamChunk(msg streamChunkMsg) (tea.Model, tea.Cmd) {
	(&m).handleStreamEvent(msg.ev)
	if m.streaming && m.streamCh != nil {
		return m, waitForChunk(m.streamCh)
	}
	return m, nil
}

func (m *model) handleStreamEvent(ev agent.StreamEvent) {
	switch ev.Type {
	case "text":
		m.streamText.WriteString(ev.Text)
		m.upsertAssistant()
	case "reasoning":
		m.streamThink.WriteString(ev.Reasoning)
		m.upsertReasoning(ev.Reasoning)
	case "tool_start":
		m.handleToolStart(ev)
	case "tool_result":
		m.blocks = append(m.blocks, block{Role: "tool", Meta: ev.ToolName + " →", Content: ev.ToolResult})
		m.syncViewport()
	case "error":
		m.blocks = append(m.blocks, block{Role: "error", Content: ev.Text})
		m.syncViewport()
	}
}

func (m *model) handleToolStart(ev agent.StreamEvent) {
	if ev.ToolName == "" {
		return
	}
	if len(m.blocks) > 0 && m.blocks[len(m.blocks)-1].Role == "tool" && m.blocks[len(m.blocks)-1].Meta == ev.ToolName {
		m.blocks[len(m.blocks)-1].Content += ev.ToolArgs
	} else {
		m.blocks = append(m.blocks, block{Role: "tool", Meta: ev.ToolName, Content: ev.ToolArgs})
	}
	m.syncViewport()
}

func (m model) updateStreamDone(msg streamDoneMsg) (tea.Model, tea.Cmd) {
	if m.cancel != nil {
		m.cancel()
	}
	m.streaming = false
	m.cancel = nil
	m.streamCh = nil
	if msg.err != nil && msg.err != context.Canceled {
		m.blocks = append(m.blocks, block{Role: "error", Content: msg.err.Error()})
	} else {
		m.finalizeStreamDone()
	}
	m.input.Focus()
	m.syncViewport()
	return m, textinput.Blink
}

func (m *model) finalizeStreamDone() {
	finalText := m.resolveFinalText()
	if m.pendingPrompt != "" {
		m.cfg.History = append(m.cfg.History, llm.Message{Role: "user", Content: m.pendingPrompt})
		m.cfg.History = append(m.cfg.History, llm.Message{Role: "assistant", Content: finalText})
	}
	m.pendingPrompt = ""
	m.streamText.Reset()
	m.streamThink.Reset()
}

func (m *model) resolveFinalText() string {
	finalText := strings.TrimSpace(m.streamText.String())
	if finalText != "" {
		return finalText
	}
	for i := len(m.blocks) - 1; i >= 0; i-- {
		if m.blocks[i].Role == "assistant" && strings.TrimSpace(m.blocks[i].Content) != "" {
			return m.blocks[i].Content
		}
	}
	return ""
}

// ponytail: one dismiss-and-respond replaces 5 copies of grab-ch/nil-state/focus/send
func (m *model) dismissAsk(resp tools.AskResponse) tea.Cmd {
	ch := m.askState.respChan
	m.askState = nil
	m.input.Focus()
	select {
	case ch <- resp:
	default:
	}
	return textinput.Blink
}

func (m *model) dismissPerm(approved bool) tea.Cmd {
	ch := m.permState.respChan
	m.permState = nil
	m.input.Focus()
	select {
	case ch <- tools.PermissionResponse{Approved: approved}:
	default:
	}
	return textinput.Blink
}

func (m *model) handleAskKey(msg tea.KeyMsg) (tea.Cmd, bool) {
	switch msg.String() {
	case "esc":
		return m.dismissAsk(tools.AskResponse{Selected: -1}), true
	case "up", "shift+tab":
		if m.askState.cursor > 0 {
			m.askState.cursor--
		}
		m.syncAskFocus()
		return nil, true
	case "down", "tab":
		if m.askState.cursor < 3 {
			m.askState.cursor++
		}
		m.syncAskFocus()
		return nil, true
	case "enter":
		if m.askState.cursor == 3 {
			val := strings.TrimSpace(m.askState.input.Value())
			if val == "" {
				return nil, true
			}
			return m.dismissAsk(tools.AskResponse{Selected: -1, Answer: val, Label: val}), true
		}
		opt := m.askState.req.Options[m.askState.cursor]
		return m.dismissAsk(tools.AskResponse{Selected: m.askState.cursor, Answer: opt, Label: opt}), true
	case "1", "2", "3":
		idx := int(msg.String()[0] - '1')
		if idx < len(m.askState.req.Options) {
			opt := m.askState.req.Options[idx]
			return m.dismissAsk(tools.AskResponse{Selected: idx, Answer: opt, Label: opt}), true
		}
		return nil, true
	}
	return nil, false
}

func (m *model) syncAskFocus() {
	if m.askState.cursor == 3 {
		m.askState.input.Focus()
	} else {
		m.askState.input.Blur()
	}
}

func (m *model) handlePermissionKey(msg tea.KeyMsg) (tea.Cmd, bool) {
	switch msg.String() {
	case "esc", "n", "N":
		return m.dismissPerm(false), true
	case "y", "Y":
		return m.dismissPerm(true), true
	case "left", "right", "tab", "shift+tab":
		if m.permState.cursor == 0 {
			m.permState.cursor = 1
		} else {
			m.permState.cursor = 0
		}
		return nil, true
	case "enter":
		return m.dismissPerm(m.permState.cursor == 0), true
	}
	return nil, false
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
	if len(parts) == 0 {
		return
	}
	switch parts[0] {
	case "/clear":
		m.handleClearCmd()
	case "/help":
		m.handleHelpCmd()
	case "/model":
		m.handleModelCmd(parts)
	case "/permission", "/perm":
		m.handlePermissionCmd(parts)
	case "/yolo", "/allow-all", "/allow":
		m.handleYoloCmd()
	case "/deny", "/ask":
		m.handleDenyAskCmd(parts[0])
	case "/quit", "/exit", "/q":
		m.handleQuitCmd()
	default:
		m.handleUnknownCmd(parts[0])
	}
}

func (m *model) handleClearCmd() { m.blocks = m.blocks[:2] }

func (m *model) handleHelpCmd() {
	m.blocks = append(m.blocks, block{Role: "system", Content: "Commands: /clear, /help, /model [deepseek-v4-flash|deepseek-v4-pro], /permission [ask|allow|deny], /yolo, /quit"})
}

func (m *model) handleModelCmd(parts []string) {
	if len(parts) != 2 {
		m.blocks = append(m.blocks, block{Role: "system", Content: "Current model: " + m.cfg.Model})
		return
	}
	m.cfg.Model = parts[1]
	m.blocks = append(m.blocks, block{Role: "system", Content: "Model → " + parts[1]})
}

func (m *model) handlePermissionCmd(parts []string) {
	if len(parts) != 2 {
		m.showCurrentPermission()
		return
	}
	if !isValidPermission(parts[1]) {
		m.blocks = append(m.blocks, block{Role: "error", Content: "Usage: /permission [ask|allow|deny]"})
		return
	}
	m.setPermission(parts[1], "Permission → "+parts[1]+" (saved to .excelsior/settings.json)")
}

func isValidPermission(p string) bool { return p == "ask" || p == "allow" || p == "deny" }

func (m *model) showCurrentPermission() {
	s := config.LoadSettings(m.cfg.Workspace)
	perm := string(s.Permission)
	if perm == "" {
		perm = "ask"
	}
	m.blocks = append(m.blocks, block{Role: "system", Content: "Current permission: " + perm + " (use /permission allow to auto-allow all)"})
}

func (m *model) handleYoloCmd() {
	m.setPermission("allow", "YOLO mode enabled → all commands auto-allowed (permission=allow, saved)")
}

func (m *model) handleDenyAskCmd(raw string) {
	perm := strings.TrimPrefix(raw, "/")
	m.setPermission(perm, "Permission → "+perm+" (saved)")
}

// ponytail: one save-and-announce (was 3 copies in permission/yolo/deny-ask handlers)
func (m *model) setPermission(perm, announce string) {
	if err := savePermissionSetting(m.cfg.Workspace, perm); err != nil {
		m.blocks = append(m.blocks, block{Role: "error", Content: "Failed to save: " + err.Error()})
		return
	}
	m.blocks = append(m.blocks, block{Role: "system", Content: announce})
}

func (m *model) handleQuitCmd() {
	m.blocks = append(m.blocks, block{Role: "system", Content: "Use Ctrl+C to quit"})
}

func (m *model) handleUnknownCmd(cmd string) {
	m.blocks = append(m.blocks, block{Role: "system", Content: "Unknown command: " + cmd + "  (try /help)"})
}

func savePermissionSetting(workspace, perm string) error {
	pm, err := config.ParsePermissionMode(perm)
	if err != nil {
		return err
	}
	s := config.LoadSettings(workspace)
	s.Permission = pm
	allowAll := pm == config.PermissionAllow
	s.AllowAll = &allowAll
	return config.SaveSettings(workspace, s)
}
