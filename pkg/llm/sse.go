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
	s := newSSEState(logger, onDelta)
	r = io.LimitReader(r, maxSSEStream)
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 4096), maxSSLine)

	for scanner.Scan() {
		if err := s.checkContext(ctx); err != nil {
			return nil, err
		}
		line := strings.TrimSpace(scanner.Text())
		if isSkippableSSELine(line) {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if s.isDoneLine(data) {
			if err := s.handleDone(); err != nil {
				return nil, err
			}
			break
		}
		if err := s.handleDataLine(data); err != nil {
			return nil, err
		}
	}
	if err := checkScannerError(scanner.Err()); err != nil {
		return nil, err
	}
	return s.buildMessage(), nil
}

type sseState struct {
	finalContent     strings.Builder
	finalReasoning   strings.Builder
	toolCallBuilders map[int]*ToolCall
	finishReason     string
	usage            *Usage
	logger           *slog.Logger
	onDelta          func(Delta) error
}

func newSSEState(logger *slog.Logger, onDelta func(Delta) error) *sseState {
	s := &sseState{
		toolCallBuilders: make(map[int]*ToolCall, 4),
		logger:           logger,
		onDelta:          onDelta,
	}
	s.finalContent.Grow(4096)
	s.finalReasoning.Grow(1024)
	return s
}

func (s *sseState) checkContext(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return fmt.Errorf("deepseek: context canceled: %w", ctx.Err())
	default:
		return nil
	}
}

func isSkippableSSELine(line string) bool {
	return line == "" || !strings.HasPrefix(line, "data:")
}

func (s *sseState) isDoneLine(data string) bool { return data == "[DONE]" }

func (s *sseState) handleDone() error {
	if s.onDelta == nil {
		return nil
	}
	return s.callOnDelta(Delta{Done: true, FinishReason: s.finishReason, Usage: s.usage}, "deepseek: onDelta done")
}

func (s *sseState) handleDataLine(data string) error {
	var chunk streamChunk
	if err := json.Unmarshal([]byte(data), &chunk); err != nil {
		s.logMalformedChunk(data, err)
		return nil
	}
	if len(chunk.Choices) == 0 {
		if chunk.Usage != nil {
			s.usage = chunk.Usage
		}
		return nil
	}
	return s.handleChoice(chunk.Choices[0])
}

func (s *sseState) logMalformedChunk(data string, err error) {
	if s.logger != nil {
		s.logger.Warn("deepseek: skip malformed SSE chunk", "data", util.Truncate(data, 500), "err", err)
	}
}

func (s *sseState) handleChoice(ch struct {
	Index        int    `json:"index"`
	FinishReason string `json:"finish_reason"`
	Delta        struct {
		Role             string          `json:"role,omitempty"`
		Content          string          `json:"content,omitempty"`
		ReasoningContent string          `json:"reasoning_content,omitempty"`
		ToolCalls        []ToolCallDelta `json:"tool_calls,omitempty"`
	} `json:"delta"`
	Usage *Usage `json:"usage,omitempty"`
}) error {
	if ch.FinishReason != "" {
		s.finishReason = ch.FinishReason
	}
	if ch.Usage != nil {
		s.usage = ch.Usage
	}
	d := Delta{
		Content:          ch.Delta.Content,
		ReasoningContent: ch.Delta.ReasoningContent,
		FinishReason:     ch.FinishReason,
	}
	s.accumulateContent(ch.Delta.Content, ch.Delta.ReasoningContent)
	s.accumulateToolCalls(ch.Delta.ToolCalls, &d)
	if isEmptyDelta(d) {
		return nil
	}
	return s.callOnDelta(d, "deepseek: onDelta")
}

func (s *sseState) accumulateContent(content, reasoningContent string) {
	if reasoningContent != "" {
		s.finalReasoning.WriteString(reasoningContent)
	}
	if content != "" {
		s.finalContent.WriteString(content)
	}
}

func (s *sseState) accumulateToolCalls(toolCalls []ToolCallDelta, d *Delta) {
	for _, tc := range toolCalls {
		s.mergeToolCall(tc)
		d.ToolCalls = append(d.ToolCalls, tc)
	}
}

func (s *sseState) mergeToolCall(tc ToolCallDelta) {
	b := s.toolCallBuilders[tc.Index]
	if b == nil {
		b = &ToolCall{Type: "function"}
		s.toolCallBuilders[tc.Index] = b
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
}

func isEmptyDelta(d Delta) bool {
	return d.Content == "" && d.ReasoningContent == "" && len(d.ToolCalls) == 0 && d.FinishReason == ""
}

func (s *sseState) callOnDelta(d Delta, prefix string) error {
	if s.onDelta == nil {
		return nil
	}
	if err := s.onDelta(d); err != nil {
		return fmt.Errorf("%s: %w", prefix, err)
	}
	return nil
}

func checkScannerError(err error) error {
	if err == nil {
		return nil
	}
	if err == bufio.ErrTooLong {
		return &LLMError{Kind: ErrorKindStream, Err: fmt.Errorf("deepseek: SSE line too large (%d > %d): %w", maxSSLine+1, maxSSLine, ErrLineTooLarge)}
	}
	return &LLMError{Kind: ErrorKindStream, Err: fmt.Errorf("deepseek: %w: %v", ErrStreamInterrupted, err)}
}

func (s *sseState) buildMessage() *Message {
	msg := &Message{
		Role:             "assistant",
		Content:          s.finalContent.String(),
		ReasoningContent: s.finalReasoning.String(),
	}
	s.appendToolCalls(msg)
	return msg
}

func (s *sseState) appendToolCalls(msg *Message) {
	if len(s.toolCallBuilders) == 0 {
		return
	}
	maxIdx := -1
	for k := range s.toolCallBuilders {
		if k > maxIdx {
			maxIdx = k
		}
	}
	for i := 0; i <= maxIdx; i++ {
		if tc, ok := s.toolCallBuilders[i]; ok {
			if tc.Type == "" {
				tc.Type = "function"
			}
			msg.ToolCalls = append(msg.ToolCalls, *tc)
		}
	}
}
