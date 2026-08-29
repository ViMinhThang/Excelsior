package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// GlobTool finds files by glob pattern (supports **).
type GlobTool struct{ Root string }

func (t *GlobTool) Name() string        { return "glob" }
func (t *GlobTool) Description() string { return "Find files by glob pattern under workspace." }
func (t *GlobTool) Parameters() any {
	return jsonSchema(map[string]any{
		"pattern": map[string]any{"type": "string", "description": "Glob like **/*.go"},
	}, []string{"pattern"})
}
func (t *GlobTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", &ToolError{Tool: "glob", Op: "glob", Err: err}
	}
	var a struct {
		Pattern string `json:"pattern"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", &ToolError{Tool: "glob", Op: "validate", Err: fmt.Errorf("%w: %v", ErrInvalidArguments, err)}
	}
	a.Pattern = strings.TrimSpace(a.Pattern)
	if a.Pattern == "" {
		return "", &ToolError{Tool: "glob", Op: "validate", Err: fmt.Errorf("%w: pattern is required", ErrInvalidArguments)}
	}
	if filepath.IsAbs(a.Pattern) || strings.Contains(a.Pattern, "..") {
		return "", &ToolError{Tool: "glob", Op: "security", Err: fmt.Errorf("%w: pattern outside workspace", ErrPathOutsideWorkspace)}
	}
	select {
	case <-ctx.Done():
		return "", &ToolError{Tool: "glob", Op: "glob", Err: ctx.Err()}
	default:
	}
	matches, err := filepath.Glob(filepath.Join(t.Root, a.Pattern))
	if err != nil {
		return "", &ToolError{Tool: "glob", Op: "glob", Err: err}
	}
	if len(matches) == 0 && strings.Contains(a.Pattern, "**") {
		var walkErr error
		matches, walkErr = walkGlob(ctx, t.Root, a.Pattern)
		if walkErr != nil {
			return "", &ToolError{Tool: "glob", Op: "glob", Err: walkErr}
		}
		if ctx.Err() != nil {
			return "", &ToolError{Tool: "glob", Op: "glob", Err: ctx.Err()}
		}
	}
	if len(matches) == 0 {
		return "No files matched.", nil
	}
	rel := make([]string, 0, len(matches))
	for _, m := range matches {
		r, err := filepath.Rel(t.Root, m)
		if err != nil {
			continue
		}
		rel = append(rel, filepath.ToSlash(r))
	}
	slog.Debug("glob", "pattern", a.Pattern, "matches", len(rel))
	return strings.Join(rel, "\n"), nil
}

func walkGlob(ctx context.Context, root, pattern string) ([]string, error) {
	var out []string
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if isSkippedDir(d.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		ok, _ := filepath.Match(pattern, rel)
		if !ok && strings.HasPrefix(pattern, "**/") {
			suffix := strings.TrimPrefix(pattern, "**/")
			if matched, _ := filepath.Match(suffix, filepath.Base(rel)); matched {
				ok = true
			}
		}
		if ok {
			out = append(out, p)
		}
		return nil
	})
	if err != nil && ctx.Err() != nil {
		return nil, ctx.Err()
	}
	return out, err
}
