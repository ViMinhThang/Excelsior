package main

import (
	"fmt"
	"log/slog"

	"excelsior/pkg/auth"
	"excelsior/pkg/db"

	"github.com/spf13/cobra"

	"excelsior/pkg/config"
	"excelsior/pkg/engine"
)

func newEngineCommand(cfg config.Config, workspaceFlag *string) *cobra.Command {
	var addr string
	var dbPath string
	var authEnabled bool
	cmd := &cobra.Command{
		Use:   "engine",
		Short: "Start WebSocket engine hub (for desktop/mobile clients)",
		Long: `Start the engine daemon. Clients connect via WebSocket:

  excelsior engine --addr :17812 --workspace .`,
		RunE: func(cmd *cobra.Command, args []string) error {
			// Runtime-only flag override (--yolo / --permission); persisted
			// permission is resolved per-request from LoadSettings.
			var override config.PermissionMode
			if v, _ := cmd.Root().PersistentFlags().GetBool("yolo"); v {
				override = config.PermissionAllow
			} else if v, _ := cmd.Root().PersistentFlags().GetString("permission"); v != "" {
				if pm, err := config.ParsePermissionMode(v); err == nil {
					override = pm
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
			h.PermissionOverride = override
			if authEnabled {
				if dbPath == "" {
					dbPath = db.DefaultPath(ws)
				}
				database, err := db.Open(dbPath)
				if err != nil {
					return fmt.Errorf("open auth database: %w", err)
				}
				defer database.Close()
				h.DB = database
				h.Auth = auth.NewStore(database)
				if _, err := h.Auth.CleanupExpired(cmd.Context()); err != nil {
					slog.Warn("cleanup expired auth tokens failed", "err", err)
				}
			}
			slog.Info("starting engine", "addr", addr, "workspace", ws, "model", cfg.Model)
			return h.ListenAndServe(cmd.Context())
		},
	}
	cmd.Flags().StringVar(&addr, "addr", ":17812", "Listen address for WS hub (e.g. :17812)")
	cmd.Flags().BoolVar(&authEnabled, "auth", false, "Require bearer-token authentication and use per-user SQLite sessions")
	cmd.Flags().StringVar(&dbPath, "db", "", "SQLite database path for authenticated engine mode (default: <workspace>/.excelsior/excelsior.db)")
	return cmd
}
