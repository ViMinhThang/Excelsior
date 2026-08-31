package main

import (
	"log/slog"

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
			// permission may be overridden via root flag context
			if v := cmd.Context().Value(configKey{}); v != nil {
				if c, ok := v.(config.Config); ok {
					cfg = c
				}
			} else if v, _ := cmd.Root().PersistentFlags().GetString("permission"); v != "" {
				if pm, err := config.ParsePermissionMode(v); err == nil {
					cfg.Permission = pm
				}
			}
			ws, err := config.ResolveWorkspace(*workspaceFlag, cfg.Workspace)
			if err != nil {
				slog.Warn("workspace resolve failed, using '.'", "err", err)
				ws = "."
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
