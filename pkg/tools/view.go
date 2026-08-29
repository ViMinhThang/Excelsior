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
		return "", fmt.Errorf("view: context canceled: %w", err)
	}
	var a struct {
		FilePath string `json:"filePath"`
		Offset   *int   `json:"offset"`
		Limit    *int   `json:"limit"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("view: invalid args: %w", err)
	}
	if strings.TrimSpace(a.FilePath) == "" {
		return "", errors.New("view: filePath is required")
	}
	offset, limit := 0, 50
	if a.Offset != nil {
		offset = *a.Offset
	}
	if a.Limit != nil {
		limit = *a.Limit
	}
	if offset < 0 {
		return "", fmt.Errorf("view: offset must be >=0, got %d", offset)
	}
	if limit < 1 || limit > 200 {
		return "", fmt.Errorf("view: limit must be 1..200, got %d", limit)
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", fmt.Errorf("view: %w", err)
	}
	info, err := os.Stat(p)
	if err != nil {
		return "", fmt.Errorf("view: %w", err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("view: %q is a directory, not a file", a.FilePath)
	}
	if info.Size() > MaxFileReadSize {
		return "", fmt.Errorf("view: file too large (%d > %d bytes)", info.Size(), MaxFileReadSize)
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", fmt.Errorf("view: %w", err)
	}
	lines := strings.Split(string(b), "\n")
	total := len(lines)
	start := offset + 1
	if start < 1 {
		start = 1
	}
	if start > total {
		return "", fmt.Errorf("view: file has %d lines, offset %d out of range", total, offset)
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
