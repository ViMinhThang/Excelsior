package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

// LLM is the provider interface the agent depends on for streaming chat completions.
type LLM interface {
	StreamChat(ctx context.Context, req llm.ChatRequest, onDelta func(llm.Delta) error) (*llm.Message, error)
	ModelName() string
}

// ToolRegistry is the port the agent depends on — small interface for testability.
type ToolRegistry interface {
	Get(name string) (tools.Tool, bool)
	All() []tools.Tool
}

// Agent is the importable library. It owns the tool-call loop and streams
// events to the caller so both CLI and TUI can render identically.
type Agent struct {
	LLM      LLM
	Tools    ToolRegistry
	System   string
	MaxIters int // tool-call loop cap
	Model    string
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

const (
	defaultMaxIters = 20
	maxToolResult   = 20_000
	maxContextChars = 600_000
)

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
	return defaultMaxIters
}

func (a *Agent) validate() error {
	if a.LLM == nil {
		return errors.New("agent: LLM not configured")
	}
	if a.MaxIters < 0 {
		return fmt.Errorf("agent: MaxIters must be >=0, got %d", a.MaxIters)
	}
	return nil
}

func (a *Agent) registry() ToolRegistry {
	if a.Tools != nil {
		return a.Tools
	}
	return tools.NewRegistry()
}

func (a *Agent) resolveModel() string {
	if a.Model != "" {
		return a.Model
	}
	if a.LLM != nil {
		return a.LLM.ModelName()
	}
	return ""
}

func totalChars(msgs []llm.Message) int {
	n := 0
	for _, m := range msgs {
		n += len(m.Content) + len(m.ReasoningContent)
	}
	return n
}

type RunResult struct {
	FinalMessage *llm.Message
	Messages     []llm.Message
}

// Run executes the agentic loop and returns the final assistant message.
func (a *Agent) Run(ctx context.Context, opts RunOptions) (*llm.Message, error) {
	res, err := a.RunWithHistory(ctx, opts)
	if err != nil {
		return nil, err
	}
	return res.FinalMessage, nil
}

// RunWithHistory executes the agentic loop and returns both the final message and the full turn history.
func (a *Agent) RunWithHistory(ctx context.Context, opts RunOptions) (*RunResult, error) {
	if err := a.validate(); err != nil {
		return nil, err
	}
	if len(opts.Messages) == 0 {
		return nil, errors.New("agent: Messages is empty")
	}
	if n := totalChars(opts.Messages); n > maxContextChars {
		return nil, fmt.Errorf("agent: context too large (%d chars > %d)", n, maxContextChars)
	}

	messages := append([]llm.Message(nil), opts.Messages...)
	if a.System != "" && (len(messages) == 0 || messages[0].Role != "system") {
		messages = append([]llm.Message{{Role: "system", Content: a.System}}, messages...)
	}

	reg := a.registry()
	toolDefs := toLLMTools(reg.All())
	emit := opts.OnEvent
	if emit == nil {
		emit = func(StreamEvent) {}
	}
	model := a.resolveModel()
	start := time.Now()
	a.logger().Info("agent run start", "model", model, "messages", len(messages), "maxIters", a.maxIters())

	for iter := 0; iter < a.maxIters(); iter++ {
		if err := ctx.Err(); err != nil {
			return nil, fmt.Errorf("agent: context canceled before iter %d: %w", iter, err)
		}
		req := llm.ChatRequest{Model: model, Messages: messages, Tools: toolDefs}
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
			if msg.Content == "" && msg.ReasoningContent == "" && iter < a.maxIters()-1 {
				continue
			}
			emit(StreamEvent{Type: "done", Text: msg.Content, FinishReason: "stop"})
			a.logger().Info("agent run done", "iters", iter+1, "totalDuration", time.Since(start))
			return &RunResult{FinalMessage: msg, Messages: messages}, nil
		}
		if err := a.execTools(ctx, reg, msg.ToolCalls, &messages, emit); err != nil {
			return nil, err
		}
	}
	return nil, fmt.Errorf("agent: max iterations (%d) reached", a.maxIters())
}

func (a *Agent) execTools(ctx context.Context, reg ToolRegistry, calls []llm.ToolCall, messages *[]llm.Message, emit func(StreamEvent)) error {
	for _, tc := range calls {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("agent: context canceled before tool %q: %w", tc.Function.Name, err)
		}
		emit(StreamEvent{Type: "tool_start", ToolName: tc.Function.Name, ToolCallID: tc.ID, ToolArgs: tc.Function.Arguments})
		start := time.Now()
		result := a.callTool(ctx, reg, tc)
		if len(result) > maxToolResult {
			result = result[:maxToolResult] + "\n[truncated]"
		}
		a.logger().Info("tool done", "name", tc.Function.Name, "duration", time.Since(start), "resultChars", len(result))
		emit(StreamEvent{Type: "tool_result", ToolName: tc.Function.Name, ToolCallID: tc.ID, ToolResult: result})
		*messages = append(*messages, llm.Message{Role: "tool", ToolCallID: tc.ID, Content: result})
	}
	return nil
}

func (a *Agent) callTool(ctx context.Context, reg ToolRegistry, tc llm.ToolCall) string {
	tool, ok := reg.Get(tc.Function.Name)
	if !ok {
		a.logger().Warn("unknown tool", "name", tc.Function.Name)
		return fmt.Sprintf("error: unknown tool %q", tc.Function.Name)
	}
	out, err := tool.Execute(ctx, json.RawMessage(tc.Function.Arguments))
	if err != nil {
		a.logger().Warn("tool error", "name", tc.Function.Name, "err", err)
		return fmt.Sprintf("error: %v", err)
	}
	return out
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
