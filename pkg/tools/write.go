package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"excelsior/pkg/util"
)

type WriteTool struct{ Root string }

func (t *WriteTool) Name() string        { return "write" }
func (t *WriteTool) Description() string { return "Create or overwrite a file with full content." }
func (t *WriteTool) Parameters() any {
	return jsonSchema(map[string]any{
		"filePath": map[string]any{"type": "string"},
		"content":  map[string]any{"type": "string"},
	}, []string{"filePath", "content"})
}
func (t *WriteTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", fmt.Errorf("write: context canceled: %w", err)
	}
	var a struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("write: invalid args: %w", err)
	}
	a.FilePath = strings.TrimSpace(a.FilePath)
	if a.FilePath == "" {
		return "", errors.New("write: filePath is required")
	}
	if len(a.Content) > MaxWriteSize {
		return "", fmt.Errorf("write: content too large (%d > %d bytes)", len(a.Content), MaxWriteSize)
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", fmt.Errorf("write: %w", err)
	}
	if err := util.WriteAtomic(p, []byte(a.Content), 0o644); err != nil {
		return "", fmt.Errorf("write: %w", err)
	}
	slog.Info("write", "path", a.FilePath, "bytes", len(a.Content))
	return fmt.Sprintf("Wrote %d bytes to %s", len(a.Content), a.FilePath), nil
}
