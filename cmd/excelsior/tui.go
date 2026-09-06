package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/engine"
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

	ctx := cmd.Context()
	if engineURL == "" {
		// No remote engine: embed one on a loopback listener, TUI talks to it over WS.
		// Runtime-only flag override (--yolo/--permission); persisted mode lives in settings.
		var override config.PermissionMode
		if yolo, _ := cmd.Root().PersistentFlags().GetBool("yolo"); yolo {
			override = config.PermissionAllow
		} else if v, _ := cmd.Root().PersistentFlags().GetString("permission"); v != "" {
			if pm, err := config.ParsePermissionMode(v); err == nil {
				override = pm
			}
		}
		url, stop, err := startEmbeddedEngine(ctx, cfg, workspace, override)
		if err != nil {
			return err
		}
		defer stop()
		engineURL = url
	}
	return tui.Run(tui.Config{Workspace: workspace, Model: model, EngineURL: engineURL})
}

// startEmbeddedEngine runs an in-process engine hub on 127.0.0.1:<ephemeral>
// and returns its WS URL. The hub is torn down when ctx is canceled.
func startEmbeddedEngine(ctx context.Context, cfg config.Config, workspace string, override config.PermissionMode) (string, func(), error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", nil, fmt.Errorf("embedded engine listen: %w", err)
	}
	engineCtx, cancel := context.WithCancel(ctx)
	h := engine.NewHub(cfg, workspace)
	h.Logger = slog.Default()
	h.PermissionOverride = override
	done := make(chan error, 1)
	go func() { done <- h.Serve(engineCtx, ln) }()
	go func() {
		<-engineCtx.Done()
		_ = ln.Close()
	}()
	stop := func() { cancel() }
	// Fail fast if the hub errored on startup.
	select {
	case err := <-done:
		cancel()
		if err != nil {
			return "", nil, fmt.Errorf("embedded engine: %w", err)
		}
	default:
	}
	return "ws://" + ln.Addr().String() + "/v1/ws", stop, nil
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
