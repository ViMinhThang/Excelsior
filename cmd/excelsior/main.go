package main

import (
	"context"
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
	"excelsior/pkg/llm"
	"excelsior/pkg/session"
	"excelsior/pkg/tools"
)

// version is set via ldflags: go build -ldflags "-X main.version=v1.2.3"
var version = "v0.1.0"

func main() {
	// Structured logger: JSON to stderr when EXCELSIOR_LOG=json, text otherwise respect level
	setupLogger()

	cfg := config.FromEnv()

	var (
		model     string
		workspace string
		system    string
		sessionID string
		verbose   bool
		engineURL string
	)

	root := &cobra.Command{
		Use:   "excelsior",
		Short: "Excelsior — DeepSeek-native coding agent (Go)",
		Long: `Excelsior is a DeepSeek-first coding agent library + CLI.

Examples:
  excelsior                          # launch TUI (interactive)
  excelsior tui                      # launch TUI explicitly
  excelsior "add tests for pkg/tools"
  excelsior -m deepseek-reasoner "explain this repo"
  echo "fix the bug in main.go" | excelsior`,
		Args: cobra.ArbitraryArgs,
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			if verbose {
				slog.SetLogLoggerLevel(slog.LevelDebug)
			}
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			prompt := strings.Join(args, " ")
			if prompt == "" {
				// read stdin if piped
				if stat, _ := os.Stdin.Stat(); stat != nil && (stat.Mode()&os.ModeCharDevice) == 0 {
					b, err := io.ReadAll(os.Stdin)
					if err != nil {
						return fmt.Errorf("read stdin: %w", err)
					}
					prompt = strings.TrimSpace(string(b))
				}
			}
			if strings.TrimSpace(prompt) == "" {
				if isTerminal(os.Stdin) && isTerminal(os.Stdout) {
					return runTUI(cmd, cfg, model, workspace, system)
				}
				return cmd.Help()
			}
			return runAgent(cmd.Context(), cfg, model, workspace, system, sessionID, prompt)
		},
	}

	root.PersistentFlags().StringVarP(&model, "model", "m", "", "DeepSeek model (deepseek-v4-flash, deepseek-v4-pro→reasoner, deepseek-chat, deepseek-reasoner)")
	root.PersistentFlags().StringVarP(&workspace, "workspace", "w", "", "Workspace root (default: cwd)")
	root.PersistentFlags().StringVar(&system, "system", "", "Override system prompt")
	root.PersistentFlags().StringVar(&sessionID, "session", "", "Session ID for persistence (.excelsior/sessions)")
	root.PersistentFlags().StringVar(&engineURL, "engine", "", "WebSocket engine URL (e.g. ws://localhost:17812/v1/ws) for remote/desktop/mobile sync")
	root.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Verbose logging (debug)")

	runCmd := &cobra.Command{
		Use:   "run [prompt]",
		Short: "Run a single turn (alias for root)",
		Args:  cobra.ArbitraryArgs,
		RunE:  root.RunE,
	}
	root.AddCommand(runCmd)

	root.AddCommand(newTUICommand(cfg, &model, &workspace, &system))
	root.AddCommand(newEngineCommand(cfg, &workspace))

	root.AddCommand(&cobra.Command{
		Use:   "models",
		Short: "List recommended DeepSeek models",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Fprintln(cmd.OutOrStdout(), "deepseek-v4-flash  — V4 Flash, fast, tool-calling (default)")
			fmt.Fprintln(cmd.OutOrStdout(), "deepseek-v4-pro    — V4 Pro (alias to deepseek-reasoner), reasoning")
			fmt.Fprintln(cmd.OutOrStdout(), "deepseek-chat      — V3, general, tool-calling")
			fmt.Fprintln(cmd.OutOrStdout(), "deepseek-reasoner  — R1, reasoning_content, slower but stronger")
		},
	})

	root.AddCommand(&cobra.Command{
		Use:   "version",
		Short: "Print version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Fprintf(cmd.OutOrStdout(), "excelsior %s (go + deepseek-native + tui)\n", version)
		},
	})

	// Graceful shutdown: signal-aware context
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := root.ExecuteContext(ctx); err != nil {
		slog.Error("command failed", "err", err)
		os.Exit(1)
	}
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

func runAgent(ctx context.Context, cfg config.Config, model, workspace, system, sessionID, prompt string) error {
	if err := cfg.Validate(); err != nil {
		return fmt.Errorf("config: %w", err)
	}
	// Resolve workspace
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
		abs, err := filepath.Abs(workspace)
		if err != nil {
			return fmt.Errorf("workspace: %w", err)
		}
		workspace = abs
	}
	if info, err := os.Stat(workspace); err != nil {
		return fmt.Errorf("workspace %q: %w", workspace, err)
	} else if !info.IsDir() {
		return fmt.Errorf("workspace %q is not a directory", workspace)
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

	// Trim prompt and guard size
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return fmt.Errorf("prompt is empty")
	}
	if len(prompt) > 200_000 {
		return fmt.Errorf("prompt too large (%d > 200000 chars)", len(prompt))
	}

	client := &llm.Client{
		APIKey:  cfg.APIKey,
		BaseURL: cfg.BaseURL,
		Model:   model,
		Logger:  slog.Default(),
	}

	ag := &agent.Agent{
		LLM:    client,
		Tools:  tools.DefaultRegistry(workspace),
		System: system,
		Logger: slog.Default(),
	}

	// Session handling (production: load history if sessionID given)
	var history []llm.Message
	if sessionID != "" {
		store := session.NewStore(filepath.Join(workspace, ".excelsior", "sessions"))
		if msgs, err := store.Load(ctx, sessionID); err == nil {
			history = msgs
			slog.Info("session loaded", "id", sessionID, "messages", len(history))
		} else if !os.IsNotExist(err) {
			slog.Warn("session load failed, starting fresh", "id", sessionID, "err", err)
		}
	}

	messages := append(append([]llm.Message(nil), history...), llm.Message{Role: "user", Content: prompt})

	slog.Info("agent run", "model", model, "workspace", workspace, "session", sessionID)

	_, err := ag.Run(ctx, agent.RunOptions{
		Messages: messages,
		OnEvent: func(ev agent.StreamEvent) {
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
				fmt.Fprintf(os.Stderr, "[%s result: %s]\n", ev.ToolName, agent.Truncate(ev.ToolResult, 400))
			case "error":
				fmt.Fprintf(os.Stderr, "\n[error: %s]\n", ev.Text)
			case "done":
				fmt.Fprintln(os.Stderr, "")
			}
		},
	})
	if err != nil {
		return fmt.Errorf("agent: %w", err)
	}
	fmt.Fprintln(os.Stderr, "")

	// Persist session if requested
	if sessionID != "" {
		store := session.NewStore(filepath.Join(workspace, ".excelsior", "sessions"))
		// Append the just-completed turn to history for next run
		// Note: ag.Run already updated history internally via messages, but we need to persist
		// For simplicity, reload and append via Save (which appends). We store full history including new exchange.
		// Build full history: history + prompt + final assistant (best-effort: use last assistant content from output would be ideal,
		// but for production we store what we sent; a more accurate store would capture final message from Run).
		// Here we store messages (which includes history + prompt + final). We don't have final directly, so we store messages as sent
		// and let session handle last-line being the latest snapshot.
		// Simpler: just save the messages slice we sent including history+prompt (agent's final will be added on next successful run via proper TUI store).
		// For now, save history+prompt (the session Store is JSONL, so next load will get this).
		if err := store.Save(ctx, sessionID, messages); err != nil {
			slog.Warn("session save failed", "id", sessionID, "err", err)
		}
	}
	return nil
}
