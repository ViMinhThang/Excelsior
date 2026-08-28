package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
)

type BashTool struct{ Root string }

func (t *BashTool) Name() string        { return "bash" }
func (t *BashTool) Description() string { return "Execute a shell command in the workspace. Returns stdout+stderr. Timeout 1s-120s." }
func (t *BashTool) Parameters() any {
	return jsonSchema(map[string]any{
		"command": map[string]any{"type": "string", "description": "Shell command"},
		"timeout": map[string]any{"type": "integer", "description": "Timeout ms, default 30000, min 1000 max 120000"},
	}, []string{"command"})
}
func (t *BashTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", fmt.Errorf("bash: context canceled: %w", err)
	}
	var a struct {
		Command string `json:"command"`
		Timeout *int   `json:"timeout"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("bash: invalid args: %w", err)
	}
	a.Command = strings.TrimSpace(a.Command)
	if a.Command == "" {
		return "", errors.New("bash: command is required")
	}
	if len(a.Command) > maxCommandLength {
		return "", fmt.Errorf("bash: command too long (%d > %d)", len(a.Command), maxCommandLength)
	}
	if a.Timeout != nil {
		if *a.Timeout < 1000 || *a.Timeout > 120000 {
			return "", fmt.Errorf("bash: timeout must be 1000..120000 ms, got %d", *a.Timeout)
		}
	}
	slog.Info("bash", "command", a.Command, "dir", t.Root)
	return runShell(ctx, t.Root, a.Command, a.Timeout)
}
