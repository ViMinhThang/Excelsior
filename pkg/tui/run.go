package tui

import tea "github.com/charmbracelet/bubbletea"

// activeProgram is set while TUI runs so QuestionHandler can Send msgs from agent goroutine.
var activeProgram *tea.Program

// Run launches the TUI and blocks until quit. It stays alive after each turn — only ctrl+c / /quit exits.
func Run(cfg Config) error {
	p := tea.NewProgram(New(cfg), tea.WithAltScreen(), tea.WithMouseCellMotion())
	activeProgram = p
	defer func() { activeProgram = nil }()
	_, err := p.Run()
	return err
}
