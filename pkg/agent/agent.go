package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

// ToolRegistry is the port the agent depends on — small interface for testability.
type ToolRegistry interface {
	Get(name string) (tools.Tool, bool)
	All() []tools.Tool
}

// Agent is the importable library. It owns the tool-call loop and streams
// events to the caller so both CLI and TUI can render identically.
type Agent struct {
	LLM      *llm.Client
	Tools    ToolRegistry
	System   string
	MaxIters int // tool-call loop cap
	Logger   *slog.Logger
}

type StreamEvent struct {
	Type         string // "text" | "reasoning" | "tool_start" | "tool_result" | "done" | "error"
	Text         string
	Reasoning    string
	ToolName     string
	ToolCallID   string
	ToolArgs     string
	ToolResult   string
	FinishReason string
}

type RunOptions struct {
	Messages []llm.Message
	// OnEvent is called for every streaming fragment. Must be non-nil for streaming UX.
	OnEvent func(StreamEvent)
}

func (a *Agent) logger() *slog.Logger {
	if a.Logger != nil {
		return a.Logger
	}
	return slog.Default()
}

func (a *Agent) maxIters() int {
	if a.MaxIters > 0 {
		return a.MaxIters
	}
	return 20
}

func (a *Agent) validate() error {
	if a.LLM == nil {
		return errors.New("agent: LLM not configured")
	}
	if strings.TrimSpace(a.LLM.APIKey) == "" {
		return errors.New("agent: LLM APIKey is empty")
	}
	if a.MaxIters < 0 {
		return fmt.Errorf("agent: MaxIters must be >=0, got %d", a.MaxIters)
	}
	return nil
}

// Run executes the agentic loop: LLM -> tool calls -> LLM ... until no more tool calls.
// It streams via OnEvent and returns the final assistant message.
func (a *Agent) Run(ctx context.Context, opts RunOptions) (*llm.Message, error) {
	if err := a.validate(); err != nil {
		return nil, err
	}
	if a.Tools == nil {
		a.Tools = tools.NewRegistry()
	}
	if len(opts.Messages) == 0 {
		return nil, errors.New("agent: Messages is empty")
	}
	// Enforce context window guard (approx 200k tokens ~ 600k chars) — truncate if too large
	const maxChars = 600_000
	totalChars := 0
	for _, m := range opts.Messages {
		totalChars += len(m.Content) + len(m.ReasoningContent)
	}
	if totalChars > maxChars {
		return nil, fmt.Errorf("agent: context too large (%d chars > %d)", totalChars, maxChars)
	}

	messages := append([]llm.Message(nil), opts.Messages...)
	if a.System != "" {
		hasSystem := len(messages) > 0 && messages[0].Role == "system"
		if !hasSystem {
			messages = append([]llm.Message{{Role: "system", Content: a.System}}, messages...)
		}
	}

	toolDefs := toLLMTools(a.Tools.All())
	emit := opts.OnEvent
	if emit == nil {
		emit = func(StreamEvent) {}
	}

	start := time.Now()
	a.logger().Info("agent run start", "model", a.LLM.Model, "messages", len(messages), "maxIters", a.maxIters())

	for iter := 0; iter < a.maxIters(); iter++ {
		if err := ctx.Err(); err != nil {
			return nil, fmt.Errorf("agent: context canceled before iter %d: %w", iter, err)
		}
		req := llm.ChatRequest{
			Model:    a.LLM.Model,
			Messages: messages,
			Tools:    toolDefs,
		}
		if len(toolDefs) == 0 {
			req.Tools = nil
		}

		a.logger().Debug("agent llm request", "iter", iter, "messages", len(messages))
		llmStart := time.Now()
		msg, err := a.LLM.StreamChat(ctx, req, func(d llm.Delta) error {
			if ctx.Err() != nil {
				return fmt.Errorf("agent onDelta canceled: %w", ctx.Err())
			}
			if d.ReasoningContent != "" {
				emit(StreamEvent{Type: "reasoning", Reasoning: d.ReasoningContent})
			}
			if d.Content != "" {
				emit(StreamEvent{Type: "text", Text: d.Content})
			}
			for _, tc := range d.ToolCalls {
				emit(StreamEvent{Type: "tool_start", ToolName: tc.Function.Name, ToolArgs: tc.Function.Arguments})
			}
			return nil
		})
		if err != nil {
			a.logger().Error("agent llm error", "iter", iter, "duration", time.Since(llmStart), "err", err)
			emit(StreamEvent{Type: "error", Text: err.Error()})
			return nil, fmt.Errorf("agent: LLM StreamChat iter %d: %w", iter, err)
		}
		a.logger().Debug("agent llm response", "iter", iter, "duration", time.Since(llmStart), "toolCalls", len(msg.ToolCalls))

		messages = append(messages, *msg)

		if len(msg.ToolCalls) == 0 {
			emit(StreamEvent{Type: "done", Text: msg.Content, FinishReason: "stop"})
			a.logger().Info("agent run done", "iters", iter+1, "totalDuration", time.Since(start))
			return msg, nil
		}

		// Execute tools sequentially with per-tool timeout via context
		for _, tc := range msg.ToolCalls {
			if err := ctx.Err(); err != nil {
				return nil, fmt.Errorf("agent: context canceled before tool %q: %w", tc.Function.Name, err)
			}
			emit(StreamEvent{Type: "tool_start", ToolName: tc.Function.Name, ToolCallID: tc.ID, ToolArgs: tc.Function.Arguments})
			a.logger().Info("tool start", "name", tc.Function.Name, "callID", tc.ID)
			toolStart := time.Now()
			tool, ok := a.Tools.Get(tc.Function.Name)
			var result string
			if !ok {
				result = fmt.Sprintf("error: unknown tool %q", tc.Function.Name)
				a.logger().Warn("unknown tool", "name", tc.Function.Name)
			} else {
				out, execErr := tool.Execute(ctx, json.RawMessage(tc.Function.Arguments))
				if execErr != nil {
					result = fmt.Sprintf("error: %v", execErr)
					a.logger().Warn("tool error", "name", tc.Function.Name, "err", execErr, "duration", time.Since(toolStart))
				} else {
					result = out
					a.logger().Info("tool done", "name", tc.Function.Name, "duration", time.Since(toolStart), "resultChars", len(result))
				}
			}
			// Truncate tool result for context window (keep LLM context manageable)
			const maxToolResult = 20_000
			if len(result) > maxToolResult {
				result = result[:maxToolResult] + "\n[truncated]"
			}
			emit(StreamEvent{Type: "tool_result", ToolName: tc.Function.Name, ToolCallID: tc.ID, ToolResult: result})
			messages = append(messages, llm.Message{
				Role:       "tool",
				ToolCallID: tc.ID,
				Content:    result,
			})
		}
	}

	return nil, fmt.Errorf("agent: max iterations (%d) reached", a.maxIters())
}

func toLLMTools(ts []tools.Tool) []llm.ToolDefinition {
	out := make([]llm.ToolDefinition, 0, len(ts))
	for _, t := range ts {
		out = append(out, llm.ToolDefinition{
			Type: "function",
			Function: llm.FuncDef{
				Name:        t.Name(),
				Description: t.Description(),
				Parameters:  t.Parameters(),
			},
		})
	}
	return out
}

// DefaultSystemPrompt is intentionally small and DeepSeek-optimized.
const DefaultSystemPrompt = `You are Excelsior, a senior coding agent. You work in the user's workspace.

Rules:
- Use tools to read, search, edit, and run. Don't guess file contents.
- Prefer minimal, correct edits. Match project style.
- After editing, verify with bash if relevant (go vet, go test, etc.).
- Be concise. No superlatives.`

func Truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return strings.TrimSpace(s[:n]) + "…"
}
