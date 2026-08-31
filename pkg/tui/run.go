package tui

import (
	"io"
	"log/slog"

	tea "github.com/charmbracelet/bubbletea"
)

// Run launches the TUI and blocks until quit. It stays alive after each turn — only ctrl+c / /quit exits.
// It silences slog to prevent log lines bleeding into the AltScreen.
func Run(cfg Config) error {
	// Silence global slog while TUI owns the terminal — restore after
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer slog.SetDefault(prev)

	if cfg.AskDispatcher == nil {
		cfg.AskDispatcher = NewAskDispatcher()
	}
	if cfg.PermissionDispatcher == nil {
		cfg.PermissionDispatcher = NewPermissionDispatcher()
	}

	p := tea.NewProgram(New(cfg), tea.WithAltScreen(), tea.WithMouseCellMotion())
	var sink UISink = p
	cfg.AskDispatcher.SetSink(sink)
	cfg.PermissionDispatcher.SetSink(sink)
	defer cfg.AskDispatcher.SetSink(nil)
	defer cfg.PermissionDispatcher.SetSink(nil)

	_, err := p.Run()
	return err
}
