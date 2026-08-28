package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

func main() {
	cfg := config.FromEnv()

	var (
		model     string
		workspace string
		system    string
		sessionID string
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
		RunE: func(cmd *cobra.Command, args []string) error {
			prompt := strings.Join(args, " ")
			if prompt == "" {
				// read stdin if piped
				if stat, _ := os.Stdin.Stat(); stat != nil && (stat.Mode()&os.ModeCharDevice) == 0 {
					b, _ := bufio.NewReader(os.Stdin).ReadString('\x00')
					if b == "" {
						scanner := bufio.NewScanner(os.Stdin)
						var sb strings.Builder
						for scanner.Scan() {
							sb.WriteString(scanner.Text())
							sb.WriteString("\n")
						}
						b = sb.String()
					}
					prompt = strings.TrimSpace(b)
				}
			}
			if strings.TrimSpace(prompt) == "" {
				// No prompt and no pipe: launch TUI if terminal, else show help
				if isTerminal(os.Stdin) && isTerminal(os.Stdout) {
					return runTUI(cmd, cfg, model, workspace, system)
				}
				return cmd.Help()
			}
			return runAgent(cmd.Context(), cfg, model, workspace, system, sessionID, prompt)
		},
	}

	root.PersistentFlags().StringVarP(&model, "model", "m", "", "DeepSeek model (deepseek-chat, deepseek-reasoner)")
	root.PersistentFlags().StringVarP(&workspace, "workspace", "w", "", "Workspace root (default: cwd)")
	root.PersistentFlags().StringVar(&system, "system", "", "Override system prompt")
	root.PersistentFlags().StringVar(&sessionID, "session", "", "Session ID for persistence (.excelsior/sessions)")

	runCmd := &cobra.Command{
		Use:   "run [prompt]",
		Short: "Run a single turn (alias for root)",
		Args:  cobra.ArbitraryArgs,
		RunE:  root.RunE,
	}
	root.AddCommand(runCmd)

	root.AddCommand(newTUICommand(cfg, &model, &workspace, &system))

	root.AddCommand(&cobra.Command{
		Use:   "models",
		Short: "List recommended DeepSeek models",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Fprintln(cmd.OutOrStdout(), "deepseek-chat      — V3, general, tool-calling (default)")
			fmt.Fprintln(cmd.OutOrStdout(), "deepseek-reasoner  — R1, reasoning_content, slower but stronger")
		},
	})

	root.AddCommand(&cobra.Command{
		Use:   "version",
		Short: "Print version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Fprintln(cmd.OutOrStdout(), "excelsior v0.1.0 (go + deepseek-native + tui)")
		},
	})

	if err := root.ExecuteContext(context.Background()); err != nil {
		os.Exit(1)
	}
}

func runAgent(ctx context.Context, cfg config.Config, model, workspace, system, sessionID, prompt string) error {
	if cfg.APIKey == "" {
		return fmt.Errorf("DEEPSEEK_API_KEY not set")
	}
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

	// Load session if requested
	var history []llm.Message
	if sessionID != "" {
		// session store is .excelsior/sessions relative to workspace
		_ = filepath.Join(workspace, ".excelsior", "sessions")
		// lazy load - ignore if missing
	}

	messages := append(history, llm.Message{Role: "user", Content: prompt})

	// Streaming render: reasoning to stderr dim, content to stdout
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
				// keep compact; full output already captured in next LLM context
				fmt.Fprintf(os.Stderr, "[%s result: %s]\n", ev.ToolName, agent.Truncate(ev.ToolResult, 400))
			case "error":
				fmt.Fprintf(os.Stderr, "\n[error: %s]\n", ev.Text)
			case "done":
				fmt.Fprintln(os.Stderr, "")
			}
		},
	})
	if err != nil {
		return err
	}
	fmt.Fprintln(os.Stderr, "")
	return nil
}
