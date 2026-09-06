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
		return "", errf("grep", "grep", "", err)
	}
	var a struct {
		Pattern string  `json:"pattern"`
		Path    *string `json:"path"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", errf("grep", "validate", "", fmt.Errorf("%w: %v", ErrInvalidArguments, err))
	}
	a.Pattern = strings.TrimSpace(a.Pattern)
	if a.Pattern == "" {
		return "", errf("grep", "validate", "", fmt.Errorf("%w: pattern is required", ErrInvalidArguments))
	}
	dir := t.Root
	displayPath := "."
	if a.Path != nil && strings.TrimSpace(*a.Path) != "" {
		displayPath = *a.Path
		var err error
		dir, err = secureJoin(t.Root, *a.Path)
		if err != nil {
			return "", errf("grep", "security", displayPath, err)
		}
	}
	if info, err := os.Stat(dir); err != nil {
		return "", errf("grep", "stat", displayPath, err)
	} else if !info.IsDir() {
		return "", errf("grep", "stat", displayPath, fmt.Errorf("%w: %q is not a directory", ErrNotADirectory, displayPath))
	}
	return grepWalk(ctx, a.Pattern, dir, t.Root)
}

func grepWalk(ctx context.Context, pattern, dir, root string) (string, error) {
	var out []string
	count := 0
	err := filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		return handleGrepEntry(ctx, p, d, err, pattern, root, &out, &count)
	})
	if err != nil && !errors.Is(err, filepath.SkipAll) && !errors.Is(err, context.Canceled) {
		slog.Warn("grep walk error", "err", err)
	}
	if ctx.Err() != nil {
		return "", errf("grep", "grep", "", ctx.Err())
	}
	if len(out) == 0 {
		return "No matches.", nil
	}
	slog.Debug("grep", "pattern", pattern, "matches", len(out))
	return strings.Join(out, "\n"), nil
}

func handleGrepEntry(ctx context.Context, p string, d os.DirEntry, walkErr error, pattern, root string, out *[]string, count *int) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if walkErr != nil || d == nil {
		return nil
	}
	if d.IsDir() {
		return handleGrepDir(d)
	}
	if shouldSkipGrepFile(p, d) {
		return nil
	}
	return grepFile(ctx, p, pattern, root, out, count)
}

func handleGrepDir(d os.DirEntry) error {
	if isSkippedDir(d.Name()) {
		return filepath.SkipDir
	}
	return nil
}

func shouldSkipGrepFile(p string, d os.DirEntry) bool {
	info, err := d.Info()
	if err != nil || info == nil || info.Size() > MaxGrepFileSize {
		return true
	}
	if isBinaryExt(p) {
		return true
	}
	return false
}

func isBinaryExt(p string) bool {
	switch strings.ToLower(filepath.Ext(p)) {
	case ".exe", ".dll", ".so", ".bin":
		return true
	default:
		return false
	}
}

func grepFile(ctx context.Context, p, pattern, root string, out *[]string, count *int) error {
	b, err := os.ReadFile(p)
	if err != nil || len(b) > MaxGrepFileSize {
		return nil
	}
	rel, _ := filepath.Rel(root, p)
	rel = filepath.ToSlash(rel)
	lines := strings.Split(string(b), "\n")
	return scanGrepLines(ctx, lines, pattern, rel, out, count)
}

func scanGrepLines(ctx context.Context, lines []string, pattern, rel string, out *[]string, count *int) error {
	for i, line := range lines {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if !strings.Contains(line, pattern) {
			continue
		}
		if len(line) > 500 {
			line = line[:500] + "…"
		}
		*out = append(*out, fmt.Sprintf("%s:%d:%s", rel, i+1, line))
		*count++
		if *count >= MaxGrepResults {
			return filepath.SkipAll
		}
	}
	return nil
}
