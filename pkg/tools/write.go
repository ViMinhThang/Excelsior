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
		return "", errf("write", "write", "", err)
	}
	var a struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", errf("write", "validate", "", fmt.Errorf("%w: %v", ErrInvalidArguments, err))
	}
	a.FilePath = strings.TrimSpace(a.FilePath)
	if a.FilePath == "" {
		return "", errf("write", "validate", "", fmt.Errorf("%w: filePath is required", ErrInvalidArguments))
	}
	if len(a.Content) > MaxWriteSize {
		return "", errf("write", "validate", a.FilePath, fmt.Errorf("%w: content too large (%d > %d bytes)", ErrFileTooLarge, len(a.Content), MaxWriteSize))
	}
	// Permission gate — once per call, sequentially (handled by caller loop).
	permPreview := util.Truncate(a.Content, 8000)
	if err := checkPermission(ctx, "write", PermissionRequest{Tool: "write", FilePath: a.FilePath, Preview: permPreview}); err != nil {
		return "", err
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", errf("write", "security", a.FilePath, err)
	}
	if err := util.WriteAtomic(p, []byte(a.Content), 0o644); err != nil {
		return "", errf("write", "write", a.FilePath, err)
	}
	slog.Info("write", "path", a.FilePath, "bytes", len(a.Content))
	// Include a preview of the written content as a fenced code block so the
	// web/TUI "View output" can render syntax-highlighted code.
	ext := ""
	if dot := strings.LastIndex(a.FilePath, "."); dot != -1 {
		ext = strings.ToLower(strings.TrimPrefix(a.FilePath[dot:], "."))
	}
	langMap := map[string]string{
		"tsx": "tsx", "ts": "typescript", "js": "javascript", "jsx": "jsx",
		"py": "python", "go": "go", "json": "json", "md": "markdown",
		"css": "css", "html": "html", "yaml": "yaml", "yml": "yaml",
		"sh": "bash", "bash": "bash", "sql": "sql", "rs": "rust",
	}
	lang := langMap[ext]
	if lang == "" {
		lang = ext
	}
	preview := util.Truncate(a.Content, 8000)
	if lang != "" {
		return fmt.Sprintf("Wrote %d bytes to %s\n\n```%s\n%s\n```", len(a.Content), a.FilePath, lang, preview), nil
	}
	return fmt.Sprintf("Wrote %d bytes to %s\n\n%s", len(a.Content), a.FilePath, preview), nil
}
