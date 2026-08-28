package main

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
	"excelsior/pkg/tui"
)

func newTUICommand(cfg config.Config, modelFlag *string, workspaceFlag *string, systemFlag *string) *cobra.Command {
	return &cobra.Command{
		Use:   "tui",
		Short: "Launch interactive TUI",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runTUI(cmd, cfg, *modelFlag, *workspaceFlag, *systemFlag)
		},
	}
}

func runTUI(cmd *cobra.Command, cfg config.Config, model, workspace, system string) error {
	if workspace != "" {
		workspace = strings.TrimSpace(workspace)
	} else if cfg.Workspace != "" {
		workspace = cfg.Workspace
	} else {
		wd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("getwd: %w", err)
		}
		workspace = wd
	}
	if !filepath.IsAbs(workspace) {
		if abs, err := filepath.Abs(workspace); err == nil {
			workspace = abs
		}
	}
	if model == "" {
		model = cfg.Model
	}
	model = config.ResolveModel(model)
	if model == "" {
		model = "deepseek-v4-flash"
	}
	if system == "" {
		system = agent.DefaultSystemPrompt
	}
	if err := cfg.Validate(); err != nil {
		// For TUI, warn but allow to start (user can set key in /settings later)
		fmt.Fprintln(os.Stderr, "warning:", err)
		slog.Warn("config validation failed (TUI will start)", "err", err)
	} else {
		slog.Info("TUI start", "model", model, "workspace", workspace)
	}

	// In TUI we silence logs — they would bleed into AltScreen (see screenshot)
	discardLog := slog.New(slog.NewTextHandler(io.Discard, nil))
	client := &llm.Client{
		APIKey:  cfg.APIKey,
		BaseURL: cfg.BaseURL,
		Model:   model,
		Logger:  discardLog,
	}
	ag := &agent.Agent{
		LLM:    client,
		Tools:  tools.DefaultRegistry(workspace),
		System: system,
		Logger: discardLog,
	}

	return tui.Run(tui.Config{
		Agent:     ag,
		Workspace: workspace,
		Model:     model,
	})
}

func isTerminal(f *os.File) bool {
	return term.IsTerminal(int(f.Fd()))
}
