package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
)

type EditTool struct{ Root string }

func (t *EditTool) Name() string        { return "edit" }
func (t *EditTool) Description() string { return "Replace exact text block in a file. oldText must appear exactly once." }
func (t *EditTool) Parameters() any {
	return jsonSchema(map[string]any{
		"filePath": map[string]any{"type": "string"},
		"oldText":  map[string]any{"type": "string"},
		"newText":  map[string]any{"type": "string"},
	}, []string{"filePath", "oldText", "newText"})
}
func (t *EditTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", fmt.Errorf("edit: context canceled: %w", err)
	}
	var a struct {
		FilePath string `json:"filePath"`
		OldText  string `json:"oldText"`
		NewText  string `json:"newText"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("edit: invalid args: %w", err)
	}
	a.FilePath = strings.TrimSpace(a.FilePath)
	if a.FilePath == "" {
		return "", errors.New("edit: filePath is required")
	}
	if a.OldText == "" {
		return "", errors.New("edit: oldText must be non-empty")
	}
	if len(a.NewText) > maxWriteSize {
		return "", fmt.Errorf("edit: newText too large (%d > %d)", len(a.NewText), maxWriteSize)
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", fmt.Errorf("edit: %w", err)
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", fmt.Errorf("edit: %w", err)
	}
	if len(b) > maxWriteSize {
		return "", fmt.Errorf("edit: file too large (%d > %d)", len(b), maxWriteSize)
	}
	content := string(b)
	count := strings.Count(content, a.OldText)
	if count == 0 {
		return "", fmt.Errorf("edit: oldText not found")
	}
	if count > 1 {
		return "", fmt.Errorf("edit: oldText matched %d times, must be unique", count)
	}
	content = strings.Replace(content, a.OldText, a.NewText, 1)
	if len(content) > maxWriteSize {
		return "", fmt.Errorf("edit: resulting file too large (%d > %d)", len(content), maxWriteSize)
	}
	if err := writeAtomic(p, []byte(content), 0o644); err != nil {
		return "", fmt.Errorf("edit: %w", err)
	}
	slog.Info("edit", "path", a.FilePath)
	return fmt.Sprintf("Edited %s", a.FilePath), nil
}
