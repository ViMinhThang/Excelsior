package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"excelsior/pkg/util"
)

// WriteTool creates or overwrites a file with full content atomically.
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
		return "", &ToolError{Tool: "write", Op: "write", Err: err}
	}
	var a struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "write", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.FilePath = strings.TrimSpace(a.FilePath)
	if a.FilePath == "" {
		return "", &ToolError{Tool: "write", Op: "validate", Err: fmt.Errorf("%w: filePath is required", ErrInvalidArguments)}
	}
	if len(a.Content) > MaxWriteSize {
		return "", &ToolError{Tool: "write", Op: "validate", Path: a.FilePath, Err: fmt.Errorf("%w: content too large (%d > %d bytes)", ErrFileTooLarge, len(a.Content), MaxWriteSize)}
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", &ToolError{Tool: "write", Op: "security", Path: a.FilePath, Err: err}
	}
	if err := util.WriteAtomic(p, []byte(a.Content), 0o644); err != nil {
		return "", &ToolError{Tool: "write", Op: "write", Path: a.FilePath, Err: err}
	}
	slog.Info("write", "path", a.FilePath, "bytes", len(a.Content))
	return fmt.Sprintf("Wrote %d bytes to %s", len(a.Content), a.FilePath), nil
}
