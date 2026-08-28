package main

import (
	"fmt"
	"os"

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
	if workspace == "" {
		wd, _ := os.Getwd()
		workspace = wd
	}
	if model == "" {
		model = cfg.Model
	}
	if model == "" {
		model = "deepseek-chat"
	}
	if system == "" {
		system = agent.DefaultSystemPrompt
	}
	if cfg.APIKey == "" {
		fmt.Fprintln(os.Stderr, "warning: DEEPSEEK_API_KEY not set — TUI will start but agent calls will fail")
	}

	client := &llm.Client{
		APIKey:  cfg.APIKey,
		BaseURL: cfg.BaseURL,
		Model:   model,
	}
	ag := &agent.Agent{
		LLM:    client,
		Tools:  tools.DefaultRegistry(workspace),
		System: system,
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
