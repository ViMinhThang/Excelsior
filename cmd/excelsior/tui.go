package main

import (
	"fmt"
	"io"
	"log/slog"
	"os"
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
	// cfg may have permission override from root PersistentPreRunE context (including yolo)
	if v := cmd.Context().Value(configKey{}); v != nil {
		if c, ok := v.(config.Config); ok {
			cfg = c
		}
	} else {
		if yolo, _ := cmd.Root().PersistentFlags().GetBool("yolo"); yolo {
			cfg.Permission = config.PermissionAllow
		} else if yolo, _ := cmd.Root().PersistentFlags().GetBool("allow-all"); yolo {
			cfg.Permission = config.PermissionAllow
		} else if v, _ := cmd.Root().PersistentFlags().GetString("permission"); v != "" {
			if pm, err := config.ParsePermissionMode(v); err == nil {
				cfg.Permission = pm
			}
		}
	}
	workspace = resolveWorkspaceOrCwd(workspace, cfg.Workspace)
	model = normalizeModel(model, cfg.Model)
	if system == "" {
		system = agent.DefaultSystemPrompt
	}
	engineURL := strings.TrimSpace(cfg.EngineURL)
	if v, _ := cmd.Root().PersistentFlags().GetString("engine"); v != "" {
		engineURL = strings.TrimSpace(v)
	}
	if err := cfg.Validate(); err != nil && engineURL == "" {
		fmt.Fprintln(os.Stderr, "warning:", err)
		slog.Warn("config validation failed (TUI will start)", "err", err)
	} else if engineURL != "" {
		slog.Info("TUI start (remote engine)", "engine", engineURL, "model", model, "workspace", workspace)
	} else {
		slog.Info("TUI start", "model", model, "workspace", workspace)
	}

	discardLog := slog.New(slog.NewTextHandler(io.Discard, nil))
	var ag *agent.Agent
	if engineURL == "" {
		ag = &agent.Agent{
			LLM:    &llm.Client{APIKey: cfg.APIKey, BaseURL: cfg.BaseURL, Model: model, Logger: discardLog},
			Tools:  tools.DefaultRegistry(workspace),
			System: system,
			Logger: discardLog,
		}
	}
	return tui.Run(tui.Config{Agent: ag, Workspace: workspace, Model: model, EngineURL: engineURL, Permission: string(cfg.Permission)})
}

func resolveWorkspaceOrCwd(flagWS, cfgWS string) string {
	if ws, err := config.ResolveWorkspace(flagWS, cfgWS); err == nil {
		return ws
	}
	// config.ResolveWorkspace already falls back to Getwd; only fallback left is "."
	if ws, err := os.Getwd(); err == nil && ws != "" {
		return ws
	}
	return "."
}

func isTerminal(f *os.File) bool {
	return term.IsTerminal(int(f.Fd()))
}
