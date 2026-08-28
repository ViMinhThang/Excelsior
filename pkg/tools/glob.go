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
		return "", fmt.Errorf("glob: context canceled: %w", err)
	}
	var a struct{ Pattern string `json:"pattern"` }
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("glob: invalid args: %w", err)
	}
	a.Pattern = strings.TrimSpace(a.Pattern)
	if a.Pattern == "" {
		return "", errors.New("glob: pattern is required")
	}
	if filepath.IsAbs(a.Pattern) || strings.Contains(a.Pattern, "..") {
		return "", fmt.Errorf("glob: pattern outside workspace")
	}
	select {
	case <-ctx.Done():
		return "", fmt.Errorf("glob: context canceled: %w", ctx.Err())
	default:
	}
	matches, err := filepath.Glob(filepath.Join(t.Root, a.Pattern))
	if err != nil {
		return "", fmt.Errorf("glob: %w", err)
	}
	if len(matches) == 0 && strings.Contains(a.Pattern, "**") {
		matches = walkGlob(ctx, t.Root, a.Pattern)
		if ctx.Err() != nil {
			return "", fmt.Errorf("glob: context canceled: %w", ctx.Err())
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

func walkGlob(ctx context.Context, root, pattern string) []string {
	var out []string
	_ = filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if info.Name() == ".git" || info.Name() == "node_modules" || info.Name() == ".excelsior" {
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
	return out
}
