package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
	"unicode/utf8"

	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

// LLM is the provider interface the agent depends on for streaming chat completions.
type LLM = llm.Provider

// Runner defines the execution interface for an agentic turn.
// It allows consumers (e.g. WebSocket engine, TUI) to execute turns against
// either real Agent loops or mock runners.
type Runner interface {
	RunWithHistory(ctx context.Context, opts RunOptions) (*RunResult, error)
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

var _ Runner = (*Agent)(nil)

// StreamEvent is one fragment emitted during [Agent.Run].
// Type is one of "text", "reasoning", "tool_start", "tool_result", "done", "error".
type StreamEvent struct {
	Type         string // "text" | "reasoning" | "tool_start" | "tool_result" | "done" | "error"
	Text         string // delta text for Type=="text" or final text for "done"/"error"
	Reasoning    string // delta reasoning for Type=="reasoning" (deepseek-reasoner)
	ToolName     string // tool name for Type=="tool_start"/"tool_result"
	ToolCallID   string // provider tool_call_id
	ToolArgs     string // JSON arguments for Type=="tool_start"
	ToolResult   string // tool output for Type=="tool_result"
	FinishReason string // "stop" etc. for Type=="done"
}

// RunOptions controls a single [Agent.Run] invocation.
type RunOptions struct {
	// Messages is the conversation history excluding the system prompt.
	// Must contain at least one user message.
	Messages []llm.Message
	// OnEvent is called for every streaming fragment. If nil, events are dropped.
	// It must not block for long; it is invoked synchronously on the Run goroutine.
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
		return &AgentError{Phase: "validate", Err: ErrLLMNotConfigured}
	}
	if a.MaxIters < 0 {
		return &AgentError{Phase: "validate", Err: fmt.Errorf("%w, got %d", ErrInvalidMaxIterations, a.MaxIters)}
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

// RunResult is the outcome of [Agent.RunWithHistory].
type RunResult struct {
	FinalMessage *llm.Message // last assistant message (with any reasoning_content)
	Messages     []llm.Message // full history including system prompt, tool outputs, and final message
}

// Run executes the agentic loop and returns the final assistant message.
// It is a convenience wrapper around [Agent.RunWithHistory] when only the
// final message is needed.
func (a *Agent) Run(ctx context.Context, opts RunOptions) (*llm.Message, error) {
	res, err := a.RunWithHistory(ctx, opts)
	if err != nil {
		return nil, err
	}
	return res.FinalMessage, nil
}

// RunWithHistory executes the agentic loop until the model stops calling tools
// or MaxIters is reached. It streams deltas via opts.OnEvent, executes tools
// via the ToolRegistry, and returns the complete history.
func (a *Agent) RunWithHistory(ctx context.Context, opts RunOptions) (*RunResult, error) {
	if err := a.validateRunOptions(opts); err != nil {
		return nil, err
	}

	messages := a.prepareMessages(opts.Messages)
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
			return nil, &AgentError{Phase: "context", Iteration: iter, Err: fmt.Errorf("agent: context canceled before iter %d: %w", iter, err)}
		}

		msg, err := a.executeTurn(ctx, iter, model, messages, toolDefs, emit)
		if err != nil {
			return nil, err
		}
		messages = append(messages, *msg)

		if len(msg.ToolCalls) == 0 {
			if msg.Content == "" && msg.ReasoningContent == "" && iter < a.maxIters()-1 {
				continue
			}
			emit(NewDoneEvent(msg.Content, "stop"))
			a.logger().Info("agent run done", "iters", iter+1, "totalDuration", time.Since(start))
			return &RunResult{FinalMessage: msg, Messages: messages}, nil
		}

		if err := a.execTools(ctx, reg, msg.ToolCalls, &messages, emit); err != nil {
			return nil, err
		}
	}
	return nil, &AgentError{Phase: "loop", Iteration: a.maxIters(), Err: fmt.Errorf("max iterations (%d) reached: %w", a.maxIters(), ErrMaxIterationsReached)}
}

func (a *Agent) validateRunOptions(opts RunOptions) error {
	if err := a.validate(); err != nil {
		return err
	}
	if len(opts.Messages) == 0 {
		return &AgentError{Phase: "validate", Err: ErrEmptyMessages}
	}
	if n := totalChars(opts.Messages); n > maxContextChars {
		return &AgentError{Phase: "validate", Err: fmt.Errorf("%w (%d chars > %d)", ErrContextTooLarge, n, maxContextChars)}
	}
	return nil
}

func (a *Agent) prepareMessages(incoming []llm.Message) []llm.Message {
	messages := append([]llm.Message(nil), incoming...)
	if a.System != "" && (len(messages) == 0 || messages[0].Role != "system") {
		messages = append([]llm.Message{{Role: "system", Content: a.System}}, messages...)
	}
	return messages
}

func (a *Agent) executeTurn(ctx context.Context, iter int, model string, messages []llm.Message, toolDefs []llm.ToolDefinition, emit func(StreamEvent)) (*llm.Message, error) {
	req := llm.ChatRequest{Model: model, Messages: messages, Tools: toolDefs}
	if len(toolDefs) == 0 {
		req.Tools = nil
	}
	a.logger().Debug("agent llm request", "iter", iter, "messages", len(messages))
	llmStart := time.Now()
	msg, err := a.LLM.StreamChat(ctx, req, func(d llm.Delta) error {
		if ctx.Err() != nil {
			return &AgentError{Phase: "delta_callback", Iteration: iter + 1, Err: fmt.Errorf("agent onDelta canceled: %w", ctx.Err())}
		}
		if d.ReasoningContent != "" {
			emit(NewReasoningEvent(d.ReasoningContent))
		}
		if d.Content != "" {
			emit(NewTextEvent(d.Content))
		}
		return nil
	})
	if err != nil {
		a.logger().Error("agent llm error", "iter", iter, "duration", time.Since(llmStart), "err", err)
		emit(NewErrorEvent(err.Error()))
		return nil, &AgentError{Phase: "stream_chat", Iteration: iter + 1, Err: fmt.Errorf("agent: LLM StreamChat iter %d: %w", iter, err)}
	}
	if msg == nil {
		a.logger().Error("agent llm returned nil message", "iter", iter)
		emit(NewErrorEvent(ErrNilLLMMessage.Error()))
		return nil, &AgentError{Phase: "stream_chat", Iteration: iter + 1, Err: ErrNilLLMMessage}
	}
	a.logger().Debug("agent llm response", "iter", iter, "duration", time.Since(llmStart), "toolCalls", len(msg.ToolCalls))
	return msg, nil
}

func truncateRunes(s string, maxRunes int) string {
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxRunes]) + "\n[truncated]"
}

func (a *Agent) execTools(ctx context.Context, reg ToolRegistry, calls []llm.ToolCall, messages *[]llm.Message, emit func(StreamEvent)) error {
	for _, tc := range calls {
		if err := ctx.Err(); err != nil {
			return &AgentError{Phase: "tool_exec", ToolName: tc.Function.Name, Err: fmt.Errorf("agent: context canceled before tool %q: %w", tc.Function.Name, err)}
		}
		emit(NewToolStartEvent(tc.Function.Name, tc.ID, tc.Function.Arguments))
		start := time.Now()
		result := a.callTool(ctx, reg, tc)
		result = truncateRunes(result, maxToolResult)
		a.logger().Info("tool done", "name", tc.Function.Name, "duration", time.Since(start), "resultChars", len(result))
		emit(NewToolResultEvent(tc.Function.Name, tc.ID, result))
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
