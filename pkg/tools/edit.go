package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"excelsior/pkg/util"
)

// EditTool replaces an exact text block in a file. oldText must appear exactly once.
type EditTool struct{ Root string }

func (t *EditTool) Name() string { return "edit" }
func (t *EditTool) Description() string {
	return "Replace exact text block in a file. oldText must appear exactly once."
}
func (t *EditTool) Parameters() any {
	return jsonSchema(map[string]any{
		"filePath": map[string]any{"type": "string"},
		"oldText":  map[string]any{"type": "string"},
		"newText":  map[string]any{"type": "string"},
	}, []string{"filePath", "oldText", "newText"})
}
func (t *EditTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "edit", Op: "replace", Err: err}
	}
	a, err := parseEditArgs(args)
	if err != nil {
		return "", err
	}
	if err := checkEditPermission(ctx, a); err != nil {
		return "", err
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", &ToolError{Tool: "edit", Op: "security", Path: a.FilePath, Err: err}
	}
	content, err := readEditFile(p, a.FilePath)
	if err != nil {
		return "", err
	}
	if err := validateEditUniqueness(content, a); err != nil {
		return "", err
	}
	content = strings.Replace(content, a.OldText, a.NewText, 1)
	if len(content) > MaxWriteSize {
		return "", &ToolError{Tool: "edit", Op: "replace", Path: a.FilePath, Err: fmt.Errorf("%w: resulting file too large (%d > %d)", ErrFileTooLarge, len(content), MaxWriteSize)}
	}
	if err := util.WriteAtomic(p, []byte(content), 0o644); err != nil {
		return "", &ToolError{Tool: "edit", Op: "write", Path: a.FilePath, Err: err}
	}
	slog.Info("edit", "path", a.FilePath)
	return fmt.Sprintf("Edited %s", a.FilePath), nil
}

type editArgs struct {
	FilePath string `json:"filePath"`
	OldText  string `json:"oldText"`
	NewText  string `json:"newText"`
}

func parseEditArgs(args json.RawMessage) (*editArgs, error) {
	var a editArgs
	if err := json.Unmarshal(args, &a); err != nil {
		return nil, &ToolError{Tool: "edit", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.FilePath = strings.TrimSpace(a.FilePath)
	if a.FilePath == "" {
		return nil, &ToolError{Tool: "edit", Op: "validate", Err: fmt.Errorf("%w: filePath is required", ErrInvalidArguments)}
	}
	if a.OldText == "" {
		return nil, &ToolError{Tool: "edit", Op: "validate", Path: a.FilePath, Err: fmt.Errorf("%w: oldText must be non-empty", ErrInvalidArguments)}
	}
	if len(a.NewText) > MaxWriteSize {
		return nil, &ToolError{Tool: "edit", Op: "validate", Path: a.FilePath, Err: fmt.Errorf("%w: newText too large (%d > %d)", ErrFileTooLarge, len(a.NewText), MaxWriteSize)}
	}
	return &a, nil
}

func checkEditPermission(ctx context.Context, a *editArgs) error {
	preview := a.OldText + "\n→\n" + a.NewText
	if len(preview) > 8000 {
		preview = preview[:8000] + "\n… truncated"
	}
	return checkPermission(ctx, "edit", PermissionRequest{Tool: "edit", FilePath: a.FilePath, Preview: preview})
}

func readEditFile(p, filePath string) (string, error) {
	b, err := os.ReadFile(p)
	if err != nil {
		return "", &ToolError{Tool: "edit", Op: "read", Path: filePath, Err: err}
	}
	if len(b) > MaxWriteSize {
		return "", &ToolError{Tool: "edit", Op: "read", Path: filePath, Err: fmt.Errorf("%w: file too large (%d > %d)", ErrFileTooLarge, len(b), MaxWriteSize)}
	}
	return string(b), nil
}

func validateEditUniqueness(content string, a *editArgs) error {
	count := strings.Count(content, a.OldText)
	if count == 0 {
		return &ToolError{Tool: "edit", Op: "replace", Path: a.FilePath, Err: ErrTextNotFound}
	}
	if count > 1 {
		return &ToolError{Tool: "edit", Op: "replace", Path: a.FilePath, Err: fmt.Errorf("%w: oldText matched %d times, must be unique", ErrAmbiguousMatch, count)}
	}
	return nil
}
