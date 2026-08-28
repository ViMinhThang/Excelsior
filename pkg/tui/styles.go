package tui

import "github.com/charmbracelet/lipgloss"

var (
	titleStyle     = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("99"))
	userPrefix     = lipgloss.NewStyle().Foreground(lipgloss.Color("12")).Bold(true)
	assistantStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("252"))
	reasonStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("245")).Italic(true)
	toolStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Bold(true)
	toolArgStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
	toolResStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("250")).Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("238")).Padding(0, 1)
	errorStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("9")).Bold(true)
	statusStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("240")).MarginTop(1)
	helpStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("242")).Italic(true)
	borderStyle    = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("238")).Padding(0, 1)
)
