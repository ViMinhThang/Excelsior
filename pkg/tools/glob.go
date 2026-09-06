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
		return "", errf("glob", "glob", "", err)
	}
	pattern, err := parseGlobPattern(args)
	if err != nil {
		return "", err
	}
	if err := checkGlobContext(ctx); err != nil {
		return "", err
	}
	matches, err := globWithFallback(ctx, t.Root, pattern)
	if err != nil {
		return "", err
	}
	if len(matches) == 0 {
		return "No files matched.", nil
	}
	rel := relativizeMatches(t.Root, matches)
	slog.Debug("glob", "pattern", pattern, "matches", len(rel))
	return strings.Join(rel, "\n"), nil
}

func parseGlobPattern(args json.RawMessage) (string, error) {
	var a struct {
		Pattern string `json:"pattern"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", errf("glob", "validate", "", fmt.Errorf("%w: %v", ErrInvalidArguments, err))
	}
	pattern := strings.TrimSpace(a.Pattern)
	if pattern == "" {
		return "", errf("glob", "validate", "", fmt.Errorf("%w: pattern is required", ErrInvalidArguments))
	}
	if filepath.IsAbs(pattern) || strings.Contains(pattern, "..") {
		return "", errf("glob", "security", "", fmt.Errorf("%w: pattern outside workspace", ErrPathOutsideWorkspace))
	}
	return pattern, nil
}

func checkGlobContext(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return errf("glob", "glob", "", ctx.Err())
	default:
		return nil
	}
}

func globWithFallback(ctx context.Context, root, pattern string) ([]string, error) {
	matches, err := filepath.Glob(filepath.Join(root, pattern))
	if err != nil {
		return nil, errf("glob", "glob", "", err)
	}
	if len(matches) != 0 || !strings.Contains(pattern, "**") {
		return matches, nil
	}
	matches, walkErr := walkGlob(ctx, root, pattern)
	if walkErr != nil {
		return nil, errf("glob", "glob", "", walkErr)
	}
	if ctx.Err() != nil {
		return nil, errf("glob", "glob", "", ctx.Err())
	}
	return matches, nil
}

func relativizeMatches(root string, matches []string) []string {
	rel := make([]string, 0, len(matches))
	for _, m := range matches {
		r, err := filepath.Rel(root, m)
		if err != nil {
			continue
		}
		rel = append(rel, filepath.ToSlash(r))
	}
	return rel
}

func walkGlob(ctx context.Context, root, pattern string) ([]string, error) {
	var out []string
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		return handleWalkGlobEntry(ctx, root, pattern, p, d, err, &out)
	})
	if err != nil && ctx.Err() != nil {
		return nil, ctx.Err()
	}
	return out, err
}

func handleWalkGlobEntry(ctx context.Context, root, pattern, p string, d os.DirEntry, walkErr error, out *[]string) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if walkErr != nil {
		return nil
	}
	if d.IsDir() {
		return handleWalkGlobDir(d)
	}
	rel, err := filepath.Rel(root, p)
	if err != nil {
		return nil
	}
	rel = filepath.ToSlash(rel)
	if globMatches(pattern, rel) {
		*out = append(*out, p)
	}
	return nil
}

func handleWalkGlobDir(d os.DirEntry) error {
	if isSkippedDir(d.Name()) {
		return filepath.SkipDir
	}
	return nil
}

func globMatches(pattern, rel string) bool {
	if ok, _ := filepath.Match(pattern, rel); ok {
		return true
	}
	if !strings.HasPrefix(pattern, "**/") {
		return false
	}
	suffix := strings.TrimPrefix(pattern, "**/")
	matched, _ := filepath.Match(suffix, filepath.Base(rel))
	return matched
}
