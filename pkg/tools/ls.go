package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// LsTool lists directory contents (names + trailing "/" for dirs).
type LsTool struct{ Root string }

func (t *LsTool) Name() string        { return "ls" }
func (t *LsTool) Description() string { return "List directory contents." }
func (t *LsTool) Parameters() any {
	return jsonSchema(map[string]any{
		"directoryPath": map[string]any{"type": "string", "description": "Directory, default '.'"},
	}, nil)
}
func (t *LsTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "ls", Op: "list", Err: err}
	}
	var a struct {
		DirectoryPath *string `json:"directoryPath"`
	}
	if len(args) > 0 && string(args) != "null" && strings.TrimSpace(string(args)) != "" {
		if err := json.Unmarshal(args, &a); err != nil {
			return "", &ToolError{Tool: "ls", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
		}
	}
	dir := "."
	if a.DirectoryPath != nil && strings.TrimSpace(*a.DirectoryPath) != "" {
		dir = *a.DirectoryPath
	}
	p, err := secureJoin(t.Root, dir)
	if err != nil {
		if dir == "." {
			p = t.Root
		} else {
			return "", &ToolError{Tool: "ls", Op: "security", Path: dir, Err: err}
		}
	}
	entries, err := os.ReadDir(p)
	if err != nil {
		return "", &ToolError{Tool: "ls", Op: "list", Path: dir, Err: err}
	}
	if len(entries) == 0 {
		return "Directory is empty.", nil
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() {
			out = append(out, e.Name()+"/")
		} else {
			out = append(out, e.Name())
		}
	}
	return strings.Join(out, "\n"), nil
}
