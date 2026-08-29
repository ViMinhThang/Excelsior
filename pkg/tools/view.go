package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
)

// ViewTool reads a file with line-numbered pagination (offset/limit).
type ViewTool struct{ Root string }

func (t *ViewTool) Name() string { return "view" }
func (t *ViewTool) Description() string {
	return "Read file contents with pagination. Use offset/limit; default 0/50, max limit 200."
}
func (t *ViewTool) Parameters() any {
	return jsonSchema(map[string]any{
		"filePath": map[string]any{"type": "string", "description": "Path relative to workspace"},
		"offset":   map[string]any{"type": "integer", "description": "0-based start line, default 0"},
		"limit":    map[string]any{"type": "integer", "description": "Max lines to return, default 50, max 200"},
	}, []string{"filePath"})
}
func (t *ViewTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "view", Op: "read", Err: err}
	}
	var a struct {
		FilePath  string `json:"filePath"`
		Offset    *int   `json:"offset"`
		Limit     *int   `json:"limit"`
		LineStart *int   `json:"lineStart"`
		LineEnd   *int   `json:"lineEnd"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "view", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	if strings.TrimSpace(a.FilePath) == "" {
		return "", &ToolError{Tool: "view", Op: "validate", Err: fmt.Errorf("%w: filePath is required", ErrInvalidArguments)}
	}
	offset, limit := 0, 50
	if a.Offset != nil {
		offset = *a.Offset
	} else if a.LineStart != nil {
		offset = *a.LineStart - 1
		if offset < 0 {
			offset = 0
		}
	}
	if a.Limit != nil {
		limit = *a.Limit
	} else if a.LineStart != nil && a.LineEnd != nil {
		limit = *a.LineEnd - *a.LineStart + 1
	}
	if offset < 0 {
		return "", &ToolError{Tool: "view", Op: "validate", Path: a.FilePath, Err: fmt.Errorf("%w: offset must be >=0, got %d", ErrInvalidArguments, offset)}
	}
	if limit < 1 || limit > 200 {
		return "", &ToolError{Tool: "view", Op: "validate", Path: a.FilePath, Err: fmt.Errorf("%w: limit must be 1..200, got %d", ErrInvalidArguments, limit)}
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", &ToolError{Tool: "view", Op: "security", Path: a.FilePath, Err: err}
	}
	info, err := os.Stat(p)
	if err != nil {
		return "", &ToolError{Tool: "view", Op: "stat", Path: a.FilePath, Err: err}
	}
	if info.IsDir() {
		return "", &ToolError{Tool: "view", Op: "read", Path: a.FilePath, Err: fmt.Errorf("%w: %q is a directory, not a file", ErrIsADirectory, a.FilePath)}
	}
	if info.Size() > MaxFileReadSize {
		return "", &ToolError{Tool: "view", Op: "read", Path: a.FilePath, Err: fmt.Errorf("%w: size %d exceeds max %d bytes", ErrFileTooLarge, info.Size(), MaxFileReadSize)}
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", &ToolError{Tool: "view", Op: "read", Path: a.FilePath, Err: err}
	}
	lines := strings.Split(string(b), "\n")
	total := len(lines)
	start := offset + 1
	if start < 1 {
		start = 1
	}
	if start > total {
		return "", &ToolError{Tool: "view", Op: "read", Path: a.FilePath, Err: fmt.Errorf("%w: file has %d lines, offset %d out of range", ErrOffsetOutOfRange, total, offset)}
	}
	end := offset + limit
	if end > total {
		end = total
	}
	w := strings.Builder{}
	pad := len(fmt.Sprintf("%d", end))
	for i := start; i <= end; i++ {
		fmt.Fprintf(&w, "%*d: %s", pad, i, lines[i-1])
		if i < end {
			w.WriteString("\n")
		}
	}
	if end < total {
		remaining := total - end
		fmt.Fprintf(&w, "\n… %d of %d lines shown, %d more — use offset %d limit %d", end-offset, total, remaining, end, limit)
	} else {
		fmt.Fprintf(&w, "\n— %d lines total", total)
	}
	slog.Debug("view", "path", a.FilePath, "offset", offset, "limit", limit, "shown", end-start+1, "total", total)
	return w.String(), nil
}
