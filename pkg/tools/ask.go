package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type AskRequest struct {
	Question    string   `json:"question"`
	Options     []string `json:"options"`
	AllowManual bool     `json:"allowManual"`
}

type AskResponse struct {
	Selected int    `json:"selected"`
	Label    string `json:"label"`
	Answer   string `json:"answer"`
}

type QuestionHandler func(ctx context.Context, req AskRequest) (AskResponse, error)

type questionHandlerKey struct{}

func WithQuestionHandler(ctx context.Context, h QuestionHandler) context.Context {
	return context.WithValue(ctx, questionHandlerKey{}, h)
}
func GetQuestionHandler(ctx context.Context) (QuestionHandler, bool) {
	h, ok := ctx.Value(questionHandlerKey{}).(QuestionHandler)
	return h, ok
}

type AskTool struct{}

func (t *AskTool) Name() string { return "askQuestion" }
func (t *AskTool) Description() string {
	return "Ask the user a clarifying question. Provide exactly 3 options + manual input is always allowed."
}
func (t *AskTool) Parameters() any {
	return jsonSchema(map[string]any{
		"question":    map[string]any{"type": "string", "description": "Question to ask"},
		"options":     map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Exactly 3 options"},
		"allowManual": map[string]any{"type": "boolean", "description": "Allow manual input (default true)"},
	}, []string{"question"})
}
func (t *AskTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	var a struct {
		Question    string   `json:"question"`
		Options     []string `json:"options"`
		AllowManual *bool    `json:"allowManual"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("askQuestion: invalid args: %w", err)
	}
	a.Question = strings.TrimSpace(a.Question)
	if a.Question == "" {
		return "", errors.New("askQuestion: question is required")
	}
	opts := a.Options
	if len(opts) > 3 {
		opts = opts[:3]
	}
	for len(opts) < 3 {
		opts = append(opts, fmt.Sprintf("Option %d", len(opts)+1))
	}
	allowManual := true
	if a.AllowManual != nil {
		allowManual = *a.AllowManual
	}
	if h, ok := GetQuestionHandler(ctx); ok && h != nil {
		resp, err := h(ctx, AskRequest{Question: a.Question, Options: opts, AllowManual: allowManual})
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return "Question cancelled.", nil
			}
			return "", fmt.Errorf("askQuestion handler: %w", err)
		}
		if resp.Selected >= 0 && resp.Selected < len(opts) {
			return fmt.Sprintf("User selected [%d]: %s", resp.Selected+1, resp.Label), nil
		}
		if strings.TrimSpace(resp.Answer) == "" {
			return "User provided no answer.", nil
		}
		return fmt.Sprintf("User answered: %s", resp.Answer), nil
	}
	return fmt.Sprintf("QUESTION: %s | OPTIONS: 1) %s  2) %s  3) %s  (or manual)", a.Question, opts[0], opts[1], opts[2]), nil
}
