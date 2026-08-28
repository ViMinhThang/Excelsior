package tui

import tea "github.com/charmbracelet/bubbletea"

// Run launches the TUI and blocks until quit. It stays alive after each turn — only ctrl+c / /quit exits.
func Run(cfg Config) error {
	p := tea.NewProgram(New(cfg), tea.WithAltScreen(), tea.WithMouseCellMotion())
	_, err := p.Run()
	return err
}
