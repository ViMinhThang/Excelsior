package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// AskRequest is the input to a [QuestionHandler].
type AskRequest struct {
	Question    string   `json:"question"`
	Options     []string `json:"options"`
	AllowManual bool     `json:"allowManual"`
}

// AskResponse is the user's answer to an [AskRequest].
type AskResponse struct {
	Selected int    `json:"selected"` // 0..2, or -1 for manual text
	Label    string `json:"label"`    // selected option label
	Answer   string `json:"answer"`   // manual input when Selected==-1
}

// QuestionHandler is called by [AskTool.Execute] to prompt the user.
// Install it with [WithQuestionHandler]; retrieve with [GetQuestionHandler].
type QuestionHandler func(ctx context.Context, req AskRequest) (AskResponse, error)

type questionHandlerKey struct{}

// WithQuestionHandler returns a context carrying h for [AskTool] to invoke.
func WithQuestionHandler(ctx context.Context, h QuestionHandler) context.Context {
	return context.WithValue(ctx, questionHandlerKey{}, h)
}

// GetQuestionHandler retrieves the handler installed by [WithQuestionHandler].
func GetQuestionHandler(ctx context.Context) (QuestionHandler, bool) {
	h, ok := ctx.Value(questionHandlerKey{}).(QuestionHandler)
	return h, ok
}

// AskTool asks the user a clarifying question with 3 options + manual input.
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
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "askQuestion", Op: "prompt", Err: err}
	}
	var a struct {
		Question    string   `json:"question"`
		Options     []string `json:"options"`
		AllowManual *bool    `json:"allowManual"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "askQuestion", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.Question = strings.TrimSpace(a.Question)
	if a.Question == "" {
		return "", &ToolError{Tool: "askQuestion", Op: "validate", Err: fmt.Errorf("%w: question is required", ErrInvalidArguments)}
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
			return "", &ToolError{Tool: "askQuestion", Op: "prompt", Err: err}
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
