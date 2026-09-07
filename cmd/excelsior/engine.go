package main

import (
	"fmt"
	"log/slog"

	"github.com/spf13/cobra"

	"excelsior/pkg/config"
	"excelsior/pkg/engine"
)

func newEngineCommand(cfg config.Config, workspaceFlag *string) *cobra.Command {
	var addr string
	var dbPath string
	var authEnabled bool
	var origins []string
	cmd := &cobra.Command{
		Use:   "engine",
		Short: "Start WebSocket engine hub (for desktop/mobile clients)",
		Long: `Start the engine daemon. Clients connect via WebSocket:

  excelsior engine --workspace .`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if cmd.Flags().Changed("auth") || cmd.Flags().Changed("db") {
				return fmt.Errorf("--auth and --db were retired; the engine uses an owner token and JSON sessions")
			}
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
				return err
			}
			if addr == "" {
				addr = "127.0.0.1:17812"
			}
			// Validate config (needs API key for LLM)
			if err := cfg.Validate(); err != nil {
				slog.Warn("engine config", "err", err)
			}
			h := engine.NewHub(cfg, ws)
			h.Addr = addr
			h.Logger = slog.Default()
			h.PermissionOverride = override
			token, err := engine.OwnerToken(false)
			if err != nil {
				return fmt.Errorf("owner token: %w", err)
			}
			h.Token, h.AllowedOrigins = token, origins
			slog.Info("starting engine", "addr", addr, "workspace", ws, "model", cfg.Model)
			return h.ListenAndServe(cmd.Context())
		},
	}
	cmd.Flags().StringVar(&addr, "addr", "127.0.0.1:17812", "Listen address for WS hub (e.g. :17812)")
	cmd.Flags().BoolVar(&authEnabled, "auth", false, "Retired: owner-token authentication is always required")
	cmd.Flags().StringVar(&dbPath, "db", "", "Retired: sessions use workspace JSON files")
	_ = cmd.Flags().MarkHidden("auth")
	_ = cmd.Flags().MarkHidden("db")
	cmd.Flags().StringSliceVar(&origins, "origin", []string{"null", "http://localhost:3000"}, "Allowed browser origins (repeat or comma-separate)")
	cmd.AddCommand(&cobra.Command{Use: "token", Short: "Print the owner token (keep private)", RunE: func(cmd *cobra.Command, args []string) error {
		token, err := engine.OwnerToken(false)
		if err == nil {
			fmt.Fprintln(cmd.OutOrStdout(), token)
		}
		return err
	}})
	cmd.AddCommand(&cobra.Command{Use: "rotate-token", Short: "Rotate owner token; restart engine to revoke connections", RunE: func(cmd *cobra.Command, args []string) error {
		_, err := engine.OwnerToken(true)
		if err == nil {
			fmt.Fprintln(cmd.OutOrStdout(), "Token rotated. Restart the engine and reconnect clients.")
		}
		return err
	}})
	return cmd
}
