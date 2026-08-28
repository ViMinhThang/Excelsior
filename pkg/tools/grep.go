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

type GrepTool struct{ Root string }

func (t *GrepTool) Name() string        { return "grep" }
func (t *GrepTool) Description() string { return "Search file contents by substring (ripgrep-style). Use for codebase search." }
func (t *GrepTool) Parameters() any {
	return jsonSchema(map[string]any{
		"pattern": map[string]any{"type": "string"},
		"path":    map[string]any{"type": "string", "description": "Subpath, default '.'"},
	}, []string{"pattern"})
}
func (t *GrepTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", fmt.Errorf("grep: context canceled: %w", err)
	}
	var a struct {
		Pattern string  `json:"pattern"`
		Path    *string `json:"path"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("grep: invalid args: %w", err)
	}
	a.Pattern = strings.TrimSpace(a.Pattern)
	if a.Pattern == "" {
		return "", errors.New("grep: pattern is required")
	}
	dir := t.Root
	if a.Path != nil && strings.TrimSpace(*a.Path) != "" {
		var err error
		dir, err = secureJoin(t.Root, *a.Path)
		if err != nil {
			return "", fmt.Errorf("grep: %w", err)
		}
	}
	if info, err := os.Stat(dir); err != nil {
		return "", fmt.Errorf("grep: %w", err)
	} else if !info.IsDir() {
		return "", fmt.Errorf("grep: %q is not a directory", *a.Path)
	}
	return grepWalk(ctx, a.Pattern, dir, t.Root)
}

func grepWalk(ctx context.Context, pattern, dir, root string) (string, error) {
	var out []string
	count := 0
	err := filepath.Walk(dir, func(p string, info os.FileInfo, err error) error {
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
		if info.Size() > maxGrepFileSize {
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
		if len(b) > maxGrepFileSize {
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
				if count >= maxGrepResults {
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
		return "", fmt.Errorf("grep: context canceled: %w", ctx.Err())
	}
	if len(out) == 0 {
		return "No matches.", nil
	}
	slog.Debug("grep", "pattern", pattern, "matches", len(out))
	return strings.Join(out, "\n"), nil
}
