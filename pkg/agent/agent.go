package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
	"excelsior/pkg/util"
)

// LLM is the provider interface the agent depends on for streaming chat completions.
type LLM = llm.ToolLoopProvider

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
	FinalMessage *llm.Message  // last assistant message (with any reasoning_content)
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
	a.logger().Info("agent run start", "model", model, "messages", len(messages), "maxIters", a.maxIters())
	return a.runNativeToolLoop(ctx, a.LLM, model, messages, toolDefs, reg, emit)
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

func (a *Agent) runNativeToolLoop(ctx context.Context, native llm.ToolLoopProvider, model string, messages []llm.Message, toolDefs []llm.ToolDefinition, reg ToolRegistry, emit func(StreamEvent)) (*RunResult, error) {
	final, generated, err := native.StreamChatWithTools(
		ctx,
		llm.ChatRequest{Model: model, Messages: messages, Tools: toolDefs},
		a.maxIters(),
		func(toolCtx context.Context, call llm.ToolCall) (string, error) {
			tool, ok := reg.Get(call.Function.Name)
			if !ok {
				return "", fmt.Errorf("unknown tool %q", call.Function.Name)
			}
			return tool.Execute(toolCtx, json.RawMessage(call.Function.Arguments))
		},
		func(delta llm.Delta) error {
			if delta.ReasoningContent != "" {
				emit(NewReasoningEvent(delta.ReasoningContent))
			}
			if delta.Content != "" {
				emit(NewTextEvent(delta.Content))
			}
			return nil
		},
		func(call llm.ToolCall) {
			emit(NewToolStartEvent(call.Function.Name, call.ID, call.Function.Arguments))
		},
		func(call llm.ToolCall, output string, err error) {
			if err != nil {
				output = fmt.Sprintf("error: %v", err)
			}
			emit(NewToolResultEvent(call.Function.Name, call.ID, truncateRunes(output, maxToolResult)))
		},
	)
	if err != nil {
		emit(NewErrorEvent(err.Error()))
		return nil, &AgentError{Phase: "goai_tool_loop", Err: err}
	}
	if final == nil {
		return nil, &AgentError{Phase: "goai_tool_loop", Err: ErrNilLLMMessage}
	}

	fullHistory := append([]llm.Message(nil), messages...)
	fullHistory = append(fullHistory, generated...)
	if len(generated) == 0 || generated[len(generated)-1].Role != "assistant" {
		fullHistory = append(fullHistory, *final)
	}
	emit(NewDoneEvent(final.Content, "stop"))
	return &RunResult{FinalMessage: final, Messages: fullHistory}, nil
}

func truncateRunes(s string, n int) string {
	// ponytail: delegate rune counting to util.Truncate, keep "[truncated]" marker for test contract
	t := util.Truncate(s, n)
	if t == s {
		return s
	}
	return strings.TrimSuffix(t, "…") + "\n[truncated]"
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
