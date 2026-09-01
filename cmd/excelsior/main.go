package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/spf13/cobra"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/engine"
	"excelsior/pkg/llm"
	"excelsior/pkg/session"
	"excelsior/pkg/tools"
	"excelsior/pkg/util"
)

// version is set via ldflags: go build -ldflags "-X main.version=v1.2.3"
var version = "v0.1.0"

func main() {
	setupLogger()
	cfg := config.FromEnv()
	var model, workspace, system, sessionID, engineURL, permission string
	var yolo bool
	var verbose bool

	root := newRootCommand(cfg, &model, &workspace, &system, &sessionID, &engineURL, &permission, &yolo, &verbose)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := root.ExecuteContext(ctx); err != nil {
		slog.Error("command failed", "err", err)
		os.Exit(1)
	}
}

func newRootCommand(cfg config.Config, model, workspace, system, sessionID, engineURL, permission *string, yolo *bool, verbose *bool) *cobra.Command {
	root := &cobra.Command{
		Use:   "excelsior",
		Short: "Excelsior — DeepSeek-native coding agent (Go)",
		Long: `Excelsior is a DeepSeek-first coding agent library + CLI.

Examples:
  excelsior                          # launch TUI (interactive)
  excelsior tui                      # launch TUI explicitly
  excelsior "add tests for pkg/tools"
  excelsior -m deepseek-v4-pro "explain this repo"
  echo "fix the bug in main.go" | excelsior
  excelsior --yolo "run all commands without asking"  # same as --permission allow`,
		Args: cobra.ArbitraryArgs,
		PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
			if *verbose {
				slog.SetLogLoggerLevel(slog.LevelDebug)
			}
			// yolo / allow-all setting: if set, override to allow without asking
			if *yolo {
				cfg.Permission = config.PermissionAllow
			} else if *permission != "" {
				pm, err := config.ParsePermissionMode(*permission)
				if err != nil {
					return err
				}
				cfg.Permission = pm
			}
			// propagate resolved cfg for subcommands via context
			cmd.SetContext(context.WithValue(cmd.Context(), configKey{}, cfg))
			return nil
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			// resolve cfg from context (may have permission override)
			if v := cmd.Context().Value(configKey{}); v != nil {
				if c, ok := v.(config.Config); ok {
					cfg = c
				}
			}
			prompt := resolvePrompt(args)
			if prompt == "" {
				if isTerminal(os.Stdin) && isTerminal(os.Stdout) {
					return runTUI(cmd, cfg, *model, *workspace, *system)
				}
				return cmd.Help()
			}
			return runAgent(cmd.Context(), cfg, *model, *workspace, *system, *sessionID, prompt)
		},
	}
	root.PersistentFlags().StringVarP(model, "model", "m", "", "DeepSeek model (deepseek-v4-flash, deepseek-v4-pro)")
	root.PersistentFlags().StringVarP(workspace, "workspace", "w", "", "Workspace root (default: cwd)")
	root.PersistentFlags().StringVar(system, "system", "", "Override system prompt")
	root.PersistentFlags().StringVar(sessionID, "session", "", "Session ID for persistence (.excelsior/sessions)")
	root.PersistentFlags().StringVar(engineURL, "engine", "", "WebSocket engine URL (e.g. ws://localhost:17812/v1/ws)")
	root.PersistentFlags().StringVar(permission, "permission", "", "Permission mode: ask|allow|deny (default ask, overrides EXCELSIOR_PERMISSION)")
	root.PersistentFlags().BoolVar(yolo, "yolo", false, "Allow all commands without asking (same as --permission allow)")
	root.PersistentFlags().BoolVar(yolo, "allow-all", false, "Allow all commands without asking (alias for --yolo)")
	root.PersistentFlags().BoolVarP(verbose, "verbose", "v", false, "Verbose logging (debug)")

	root.AddCommand(&cobra.Command{Use: "run [prompt]", Short: "Run a single turn (alias for root)", Args: cobra.ArbitraryArgs, RunE: root.RunE})
	root.AddCommand(newTUICommand(cfg, model, workspace, system))
	root.AddCommand(newEngineCommand(cfg, workspace))
	root.AddCommand(newModelsCommand())
	root.AddCommand(newVersionCommand())
	return root
}

func newModelsCommand() *cobra.Command {
	return &cobra.Command{
		Use: "models", Short: "List recommended DeepSeek models",
		Run: func(cmd *cobra.Command, args []string) {
			for _, line := range []string{
				"deepseek-v4-flash  — V4 Flash, fast, tool-calling (default)",
				"deepseek-v4-pro    — V4 Pro, reasoning",
			} {
				fmt.Fprintln(cmd.OutOrStdout(), line)
			}
		},
	}
}

func newVersionCommand() *cobra.Command {
	return &cobra.Command{
		Use: "version", Short: "Print version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Fprintf(cmd.OutOrStdout(), "excelsior %s (go + deepseek-native + tui)\n", version)
		},
	}
}

func resolvePrompt(args []string) string {
	if p := strings.TrimSpace(strings.Join(args, " ")); p != "" {
		return p
	}
	if stat, _ := os.Stdin.Stat(); stat != nil && (stat.Mode()&os.ModeCharDevice) == 0 {
		if b, err := io.ReadAll(os.Stdin); err == nil {
			return strings.TrimSpace(string(b))
		}
	}
	return ""
}

func setupLogger() {
	level := slog.LevelInfo
	if v := strings.ToLower(os.Getenv("EXCELSIOR_LOG_LEVEL")); v == "debug" {
		level = slog.LevelDebug
	}
	var handler slog.Handler
	if strings.ToLower(os.Getenv("EXCELSIOR_LOG")) == "json" {
		handler = slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: level})
	} else {
		handler = slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level})
	}
	slog.SetDefault(slog.New(handler))
}

type configKey struct{}

func runAgent(ctx context.Context, cfg config.Config, model, workspace, system, sessionID, prompt string) error {
	if err := cfg.Validate(); err != nil {
		return fmt.Errorf("config: %w", err)
	}
	var err error
	workspace, err = config.ResolveWorkspace(workspace, cfg.Workspace)
	if err != nil {
		return err
	}
	model = normalizeModel(model, cfg.Model)
	if system == "" {
		system = agent.DefaultSystemPrompt
	}
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return fmt.Errorf("prompt is empty")
	}
	if len(prompt) > 200_000 {
		return fmt.Errorf("prompt too large (%d > 200000 chars)", len(prompt))
	}

	// Permission handler for headless CLI: argv-driven, once per call, sequential.
	var permHandler tools.PermissionHandler
	switch cfg.Permission {
	case config.PermissionAllow:
		permHandler = func(ctx context.Context, req tools.PermissionRequest) (tools.PermissionResponse, error) {
			return tools.PermissionResponse{Approved: true}, nil
		}
	case config.PermissionDeny:
		permHandler = func(ctx context.Context, req tools.PermissionRequest) (tools.PermissionResponse, error) {
			return tools.PermissionResponse{Approved: false}, nil
		}
	default: // ask but no TUI in headless mode: deny with hint
		permHandler = func(ctx context.Context, req tools.PermissionRequest) (tools.PermissionResponse, error) {
			slog.Warn("permission denied (no TUI, use --permission allow)", "tool", req.Tool, "file", req.FilePath, "command", req.Command)
			return tools.PermissionResponse{Approved: false}, nil
		}
	}
	ctx = tools.WithPermissionHandler(ctx, permHandler)

	ag := &agent.Agent{
		LLM:    &llm.Client{APIKey: cfg.APIKey, BaseURL: cfg.BaseURL, Model: model, Logger: slog.Default()},
		Tools:  tools.DefaultRegistry(workspace),
		System: system,
		Logger: slog.Default(),
	}

	history := loadHistory(ctx, workspace, sessionID)
	messages := append(append([]llm.Message(nil), history...), llm.Message{Role: "user", Content: prompt})
	slog.Info("agent run", "model", model, "workspace", workspace, "session", sessionID, "permission", cfg.Permission)

	res, err := ag.RunWithHistory(ctx, agent.RunOptions{Messages: messages, OnEvent: agentEventPrinter})
	if err != nil {
		return fmt.Errorf("agent: %w", err)
	}
	fmt.Fprintln(os.Stderr, "")
	if sessionID != "" && res != nil {
		toSave := engine.FilterSystemMessages(res.Messages)
		store := session.NewDirStore(filepath.Join(workspace, ".excelsior", "sessions"))
		rec, err := store.Load(sessionID)
		if err != nil {
			rec = session.Record{ID: sessionID}
		}
		rec.Messages = toSave
		if err := store.Save(rec); err != nil {
			slog.Warn("session save failed", "id", sessionID, "err", err)
		}
	}
	return nil
}

func normalizeModel(flagModel, cfgModel string) string {
	m := strings.TrimSpace(flagModel)
	if m == "" {
		m = strings.TrimSpace(cfgModel)
	}
	if resolved := llm.ResolveModel(m); resolved != "" {
		return resolved
	}
	return config.DefaultModel
}

func loadHistory(ctx context.Context, workspace, sessionID string) []llm.Message {
	if sessionID == "" {
		return nil
	}
	store := session.NewDirStore(filepath.Join(workspace, ".excelsior", "sessions"))
	rec, err := store.Load(sessionID)
	if err == nil {
		slog.Info("session loaded", "id", sessionID, "messages", len(rec.Messages))
		var msgs []llm.Message
		for _, m := range rec.Messages {
			if m.Role == "system" && (m.Content == "New session" || m.Content == "(empty)") {
				continue
			}
			msgs = append(msgs, m)
		}
		return msgs
	}
	if !errors.Is(err, session.ErrSessionNotFound) && !errors.Is(err, os.ErrNotExist) {
		slog.Warn("session load failed, starting fresh", "id", sessionID, "err", err)
	}
	return nil
}

func agentEventPrinter(ev agent.StreamEvent) {
	switch ev.Type {
	case "reasoning":
		fmt.Fprint(os.Stderr, ev.Reasoning)
	case "text":
		fmt.Fprint(os.Stdout, ev.Text)
	case "tool_start":
		if ev.ToolName != "" {
			fmt.Fprintf(os.Stderr, "\n[tool:%s]\n", ev.ToolName)
		}
	case "tool_result":
		fmt.Fprintf(os.Stderr, "[%s result: %s]\n", ev.ToolName, util.Truncate(ev.ToolResult, 400))
	case "error":
		fmt.Fprintf(os.Stderr, "\n[error: %s]\n", ev.Text)
	case "done":
		fmt.Fprintln(os.Stderr, "")
	}
}
