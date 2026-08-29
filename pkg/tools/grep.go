package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// GrepTool searches file contents by substring (ripgrep-style).
type GrepTool struct{ Root string }

func (t *GrepTool) Name() string { return "grep" }
func (t *GrepTool) Description() string {
	return "Search file contents by substring (ripgrep-style). Use for codebase search."
}
func (t *GrepTool) Parameters() any {
	return jsonSchema(map[string]any{
		"pattern": map[string]any{"type": "string"},
		"path":    map[string]any{"type": "string", "description": "Subpath, default '.'"},
	}, []string{"pattern"})
}
func (t *GrepTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "grep", Op: "grep", Err: err}
	}
	var a struct {
		Pattern string  `json:"pattern"`
		Path    *string `json:"path"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "grep", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.Pattern = strings.TrimSpace(a.Pattern)
	if a.Pattern == "" {
		return "", &ToolError{Tool: "grep", Op: "validate", Err: fmt.Errorf("%w: pattern is required", ErrInvalidArguments)}
	}
	dir := t.Root
	displayPath := "."
	if a.Path != nil && strings.TrimSpace(*a.Path) != "" {
		displayPath = *a.Path
		var err error
		dir, err = secureJoin(t.Root, *a.Path)
		if err != nil {
			return "", &ToolError{Tool: "grep", Op: "security", Path: displayPath, Err: err}
		}
	}
	if info, err := os.Stat(dir); err != nil {
		return "", &ToolError{Tool: "grep", Op: "stat", Path: displayPath, Err: err}
	} else if !info.IsDir() {
		return "", &ToolError{Tool: "grep", Op: "stat", Path: displayPath, Err: fmt.Errorf("%w: %q is not a directory", ErrNotADirectory, displayPath)}
	}
	return grepWalk(ctx, a.Pattern, dir, t.Root)
}

func grepWalk(ctx context.Context, pattern, dir, root string) (string, error) {
	var out []string
	count := 0
	err := filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil || d == nil {
			return nil
		}
		if d.IsDir() {
			if isSkippedDir(d.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		info, err := d.Info()
		if err != nil || info == nil {
			return nil
		}
		if info.Size() > MaxGrepFileSize {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(p))
		if ext == ".exe" || ext == ".dll" || ext == ".so" || ext == ".bin" {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		if len(b) > MaxGrepFileSize {
			return nil
		}
		text := string(b)
		lines := strings.Split(text, "\n")
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)
		for i, line := range lines {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if strings.Contains(line, pattern) {
				if len(line) > 500 {
					line = line[:500] + "…"
				}
				out = append(out, fmt.Sprintf("%s:%d:%s", rel, i+1, line))
				count++
				if count >= MaxGrepResults {
					return filepath.SkipAll
				}
			}
		}
		return nil
	})
	if err != nil && !errors.Is(err, filepath.SkipAll) && !errors.Is(err, context.Canceled) {
		slog.Warn("grep walk error", "err", err)
	}
	if ctx.Err() != nil {
		return "", &ToolError{Tool: "grep", Op: "grep", Err: ctx.Err()}
	}
	if len(out) == 0 {
		return "No matches.", nil
	}
	slog.Debug("grep", "pattern", pattern, "matches", len(out))
	return strings.Join(out, "\n"), nil
}
