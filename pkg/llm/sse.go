package llm

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"strings"

	"excelsior/pkg/util"
)

const (
	maxErrorBody = 4 * 1024
	maxSSLine    = 1 << 20 // 1 MiB per SSE line (prevent OOM)
	maxSSEStream = 10 << 20
)

// parseSSEStream reads SSE lines from r, invoking onDelta for each valid
// chunk and aggregating Content/ReasoningContent/ToolCalls into the final Message.
func parseSSEStream(ctx context.Context, r io.Reader, logger *slog.Logger, onDelta func(Delta) error) (*Message, error) {
	var finalContent, finalReasoning strings.Builder
	finalContent.Grow(4096)
	finalReasoning.Grow(1024)
	toolCallBuilders := make(map[int]*ToolCall, 4)
	var finishReason string
	var usage *Usage

	r = io.LimitReader(r, maxSSEStream)
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 4096), maxSSLine)

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("deepseek: context canceled: %w", ctx.Err())
		default:
		}
		trimmed := strings.TrimSpace(scanner.Text())
		if trimmed == "" || !strings.HasPrefix(trimmed, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
		if data == "[DONE]" {
			if onDelta != nil {
				if err := onDelta(Delta{Done: true, FinishReason: finishReason, Usage: usage}); err != nil {
					return nil, fmt.Errorf("deepseek: onDelta done: %w", err)
				}
			}
			break
		}

		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			if logger != nil {
				logger.Warn("deepseek: skip malformed SSE chunk", "data", util.Truncate(data, 500), "err", err)
			}
			continue
		}
		if len(chunk.Choices) == 0 {
			if chunk.Usage != nil {
				usage = chunk.Usage
			}
			continue
		}
		ch := chunk.Choices[0]
		if ch.FinishReason != "" {
			finishReason = ch.FinishReason
		}
		if ch.Usage != nil {
			usage = ch.Usage
		}

		d := Delta{
			Content:          ch.Delta.Content,
			ReasoningContent: ch.Delta.ReasoningContent,
			FinishReason:     ch.FinishReason,
		}
		if ch.Delta.ReasoningContent != "" {
			finalReasoning.WriteString(ch.Delta.ReasoningContent)
		}
		if ch.Delta.Content != "" {
			finalContent.WriteString(ch.Delta.Content)
		}
		for _, tc := range ch.Delta.ToolCalls {
			b := toolCallBuilders[tc.Index]
			if b == nil {
				b = &ToolCall{Type: "function"}
				toolCallBuilders[tc.Index] = b
			}
			if tc.ID != "" {
				b.ID = tc.ID
			}
			if tc.Type != "" {
				b.Type = tc.Type
			}
			if tc.Function.Name != "" {
				b.Function.Name = tc.Function.Name
			}
			if tc.Function.Arguments != "" {
				b.Function.Arguments += tc.Function.Arguments
			}
			d.ToolCalls = append(d.ToolCalls, tc)
		}

		if d.Content != "" || d.ReasoningContent != "" || len(d.ToolCalls) > 0 || d.FinishReason != "" {
			if onDelta != nil {
				if err := onDelta(d); err != nil {
					return nil, fmt.Errorf("deepseek: onDelta: %w", err)
				}
			}
		}
	}
	if err := scanner.Err(); err != nil {
		if err == bufio.ErrTooLong {
			return nil, &LLMError{Kind: ErrorKindStream, Err: fmt.Errorf("deepseek: SSE line too large (%d > %d): %w", maxSSLine+1, maxSSLine, ErrLineTooLarge)}
		}
		return nil, &LLMError{Kind: ErrorKindStream, Err: fmt.Errorf("deepseek: %w: %v", ErrStreamInterrupted, err)}
	}

	msg := &Message{
		Role:             "assistant",
		Content:          finalContent.String(),
		ReasoningContent: finalReasoning.String(),
	}
	if len(toolCallBuilders) > 0 {
		maxIdx := -1
		for k := range toolCallBuilders {
			if k > maxIdx {
				maxIdx = k
			}
		}
		for i := 0; i <= maxIdx; i++ {
			if tc, ok := toolCallBuilders[i]; ok {
				if tc.Type == "" {
					tc.Type = "function"
				}
				msg.ToolCalls = append(msg.ToolCalls, *tc)
			}
		}
	}
	return msg, nil
}
