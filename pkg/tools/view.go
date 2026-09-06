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
		return "", errf("view", "read", "", err)
	}
	a, err := parseViewArgs(args)
	if err != nil {
		return "", err
	}
	offset, limit := resolveViewPagination(a)
	if err := validateViewPagination(a.FilePath, offset, limit); err != nil {
		return "", err
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", errf("view", "security", a.FilePath, err)
	}
	if err := validateViewFile(p, a.FilePath); err != nil {
		return "", err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", errf("view", "read", a.FilePath, err)
	}
	return renderViewContent(b, a.FilePath, offset, limit)
}

type viewArgs struct {
	FilePath string `json:"filePath"`
	Offset   *int   `json:"offset"`
	Limit    *int   `json:"limit"`
}

func parseViewArgs(args json.RawMessage) (*viewArgs, error) {
	var a viewArgs
	if err := json.Unmarshal(args, &a); err != nil {
		return nil, errf("view", "validate", "", fmt.Errorf("%w: %v", ErrInvalidArguments, err))
	}
	if strings.TrimSpace(a.FilePath) == "" {
		return nil, errf("view", "validate", "", fmt.Errorf("%w: filePath is required", ErrInvalidArguments))
	}
	return &a, nil
}

func resolveViewPagination(a *viewArgs) (int, int) {
	offset, limit := 0, 50
	if a.Offset != nil {
		offset = *a.Offset
	}
	if a.Limit != nil {
		limit = *a.Limit
	}
	return offset, limit
}

func validateViewPagination(filePath string, offset, limit int) error {
	if offset < 0 {
		return errf("view", "validate", filePath, fmt.Errorf("%w: offset must be >=0, got %d", ErrInvalidArguments, offset))
	}
	if limit < 1 || limit > 200 {
		return errf("view", "validate", filePath, fmt.Errorf("%w: limit must be 1..200, got %d", ErrInvalidArguments, limit))
	}
	return nil
}

func validateViewFile(p, filePath string) error {
	info, err := os.Stat(p)
	if err != nil {
		return errf("view", "stat", filePath, err)
	}
	if info.IsDir() {
		return errf("view", "read", filePath, fmt.Errorf("%w: %q is a directory, not a file", ErrIsADirectory, filePath))
	}
	if info.Size() > MaxFileReadSize {
		return errf("view", "read", filePath, fmt.Errorf("%w: size %d exceeds max %d bytes", ErrFileTooLarge, info.Size(), MaxFileReadSize))
	}
	return nil
}

func renderViewContent(b []byte, filePath string, offset, limit int) (string, error) {
	lines := strings.Split(string(b), "\n")
	total := len(lines)
	start := offset + 1
	if start < 1 {
		start = 1
	}
	if start > total {
		return "", errf("view", "read", filePath, fmt.Errorf("%w: file has %d lines, offset %d out of range", ErrOffsetOutOfRange, total, offset))
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
	slog.Debug("view", "path", filePath, "offset", offset, "limit", limit, "shown", end-start+1, "total", total)
	return w.String(), nil
}
