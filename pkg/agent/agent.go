package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

// Agent is the importable library. It owns the tool-call loop and streams
// events to the caller so both CLI and TUI can render identically.
type Agent struct {
	LLM      *llm.Client
	Tools    *tools.Registry
	System   string
	MaxIters int // tool-call loop cap
}

type StreamEvent struct {
	Type             string // "text" | "reasoning" | "tool_start" | "tool_result" | "done" | "error"
	Text             string
	Reasoning        string
	ToolName         string
	ToolCallID       string
	ToolArgs         string
	ToolResult       string
	FinishReason     string
}

type RunOptions struct {
	Messages []llm.Message
	// OnEvent is called for every streaming fragment. Must be non-nil for streaming UX.
	OnEvent func(StreamEvent)
}

func (a *Agent) maxIters() int {
	if a.MaxIters > 0 {
		return a.MaxIters
	}
	return 20
}

// Run executes the agentic loop: LLM -> tool calls -> LLM ... until no more tool calls.
// It streams via OnEvent and returns the final assistant message.
func (a *Agent) Run(ctx context.Context, opts RunOptions) (*llm.Message, error) {
	if a.LLM == nil {
		return nil, fmt.Errorf("agent: LLM not configured")
	}
	if a.Tools == nil {
		a.Tools = tools.NewRegistry()
	}

	messages := append([]llm.Message(nil), opts.Messages...)
	if a.System != "" {
		// Inject system if not already present
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

	for iter := 0; iter < a.maxIters(); iter++ {
		req := llm.ChatRequest{
			Model:    a.LLM.Model,
			Messages: messages,
			Tools:    toolDefs,
		}
		// Let model decide tool use; if no tools, don't send them
		if len(toolDefs) == 0 {
			req.Tools = nil
		}

		msg, err := a.LLM.StreamChat(ctx, req, func(d llm.Delta) error {
			if d.ReasoningContent != "" {
				emit(StreamEvent{Type: "reasoning", Reasoning: d.ReasoningContent})
			}
			if d.Content != "" {
				emit(StreamEvent{Type: "text", Text: d.Content})
			}
			for _, tc := range d.ToolCalls {
				// ToolCall deltas come fragmented; we surface start with name when available
				emit(StreamEvent{Type: "tool_start", ToolName: tc.Function.Name, ToolArgs: tc.Function.Arguments})
			}
			return nil
		})
		if err != nil {
			emit(StreamEvent{Type: "error", Text: err.Error()})
			return nil, err
		}

		messages = append(messages, *msg)

		if len(msg.ToolCalls) == 0 {
			emit(StreamEvent{Type: "done", Text: msg.Content, FinishReason: "stop"})
			return msg, nil
		}

		// Execute tools sequentially (keeps ordering + workspace safety simple)
		for _, tc := range msg.ToolCalls {
			emit(StreamEvent{Type: "tool_start", ToolName: tc.Function.Name, ToolCallID: tc.ID, ToolArgs: tc.Function.Arguments})
			tool, ok := a.Tools.Get(tc.Function.Name)
			var result string
			if !ok {
				result = fmt.Sprintf("error: unknown tool %q", tc.Function.Name)
			} else {
				out, execErr := tool.Execute(ctx, json.RawMessage(tc.Function.Arguments))
				if execErr != nil {
					result = fmt.Sprintf("error: %v", execErr)
				} else {
					result = out
				}
			}
			emit(StreamEvent{Type: "tool_result", ToolName: tc.Function.Name, ToolCallID: tc.ID, ToolResult: result})
			// Append tool result as a tool message for next iteration
			messages = append(messages, llm.Message{
				Role:       "tool",
				ToolCallID: tc.ID,
				Content:    result,
			})
		}
		// continue loop - next LLM turn will see tool results
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
