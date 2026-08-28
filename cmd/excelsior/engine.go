package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"excelsior/pkg/config"
	"excelsior/pkg/engine"
)

func newEngineCommand(cfg config.Config, workspaceFlag *string) *cobra.Command {
	var addr string
	cmd := &cobra.Command{
		Use:   "engine",
		Short: "Start WebSocket engine hub (for TUI/desktop/mobile sync)",
		Long: `Start the engine daemon. TUI and other clients connect via WebSocket:

  excelsior engine --addr :17812 --workspace .
  excelsior tui --engine ws://localhost:17812/v1/ws`,
		RunE: func(cmd *cobra.Command, args []string) error {
			ws := *workspaceFlag
			if ws == "" {
				ws = cfg.Workspace
			}
			if ws == "" {
				wd, err := os.Getwd()
				if err != nil {
					return fmt.Errorf("getwd: %w", err)
				}
				ws = wd
			}
			if !filepath.IsAbs(ws) {
				if abs, err := filepath.Abs(ws); err == nil {
					ws = abs
				}
			}
			if addr == "" {
				addr = ":17812"
			}
			// Validate config (needs API key for LLM)
			if err := cfg.Validate(); err != nil {
				slog.Warn("engine config", "err", err)
			}
			h := engine.NewHub(cfg, ws)
			h.Addr = addr
			h.Logger = slog.Default()
			slog.Info("starting engine", "addr", addr, "workspace", ws, "model", cfg.Model)
			return h.ListenAndServe(cmd.Context())
		},
	}
	cmd.Flags().StringVar(&addr, "addr", ":17812", "Listen address for WS hub (e.g. :17812)")
	return cmd
}

// Ensure context for engine command is signal-aware via root's context
var _ = context.Background
