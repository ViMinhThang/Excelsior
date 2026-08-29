package tui

import "github.com/charmbracelet/lipgloss"

var (
	// Monochrome — toned-down off-white borders for eye comfort (252) vs prior harsh 15
	titleStyle          = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("252"))
	userPrefix          = lipgloss.NewStyle().Foreground(lipgloss.Color("252")).Bold(true)
	assistantStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("252"))
	reasonStyle         = lipgloss.NewStyle().Foreground(lipgloss.Color("245")).Italic(true)
	toolStyle           = lipgloss.NewStyle().Foreground(lipgloss.Color("252")).Bold(true)
	toolArgStyle        = lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	toolResStyle        = lipgloss.NewStyle().Foreground(lipgloss.Color("250")).Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("252")).Padding(0, 1)
	errorStyle          = lipgloss.NewStyle().Foreground(lipgloss.Color("252")).Bold(true).Underline(true)
	statusStyle         = lipgloss.NewStyle().Foreground(lipgloss.Color("240")).MarginTop(1)
	helpStyle           = lipgloss.NewStyle().Foreground(lipgloss.Color("242")).Italic(true)
	borderStyle         = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("252")).Padding(0, 1)
	scrollbarStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("238"))
	scrollbarThumbStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("252")).Bold(true)
)
