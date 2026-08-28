package tui

import (
	"io"
	"log/slog"

	tea "github.com/charmbracelet/bubbletea"
)

// activeProgram is set while TUI runs so QuestionHandler can Send msgs from agent goroutine.
var activeProgram *tea.Program

// Run launches the TUI and blocks until quit. It stays alive after each turn — only ctrl+c / /quit exits.
// It silences slog to prevent log lines bleeding into the AltScreen (see screenshot).
func Run(cfg Config) error {
	// Silence global slog while TUI owns the terminal — restore after
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer slog.SetDefault(prev)

	p := tea.NewProgram(New(cfg), tea.WithAltScreen(), tea.WithMouseCellMotion())
	activeProgram = p
	defer func() { activeProgram = nil }()
	_, err := p.Run()
	return err
}
