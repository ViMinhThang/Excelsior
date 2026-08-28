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

const (
	maxFileReadSize  = 5 << 20  // 5 MiB for view
	maxWriteSize     = 10 << 20 // 10 MiB for write/edit
	maxGrepFileSize  = 2 << 20
	maxGrepResults   = 200
	maxCommandLength = 8 << 10
)

// Tool is the interface all agent tools implement.
type Tool interface {
	Name() string
	Description() string
	Parameters() any // JSON Schema
	Execute(ctx context.Context, args json.RawMessage) (string, error)
}

// Registry holds available tools and exposes them as LLM tool definitions.
type Registry struct {
	tools map[string]Tool
}

func NewRegistry(ts ...Tool) *Registry {
	m := make(map[string]Tool, len(ts))
	for _, t := range ts {
		m[t.Name()] = t
	}
	return &Registry{tools: m}
}

func (r *Registry) Get(name string) (Tool, bool) { t, ok := r.tools[name]; return t, ok }
func (r *Registry) All() []Tool {
	out := make([]Tool, 0, len(r.tools))
	for _, t := range r.tools {
		out = append(out, t)
	}
	return out
}

// DefaultRegistry returns the core 8 tools rooted at workspace.
func DefaultRegistry(workspace string) *Registry {
	if workspace == "" {
		var err error
		workspace, err = os.Getwd()
		if err != nil {
			slog.Warn("tools: Getwd failed, using '.'", "err", err)
			workspace = "."
		}
	}
	// Ensure workspace is absolute for jail checks
	if !filepath.IsAbs(workspace) {
		if abs, err := filepath.Abs(workspace); err == nil {
			workspace = abs
		}
	}
	return NewRegistry(
		&ViewTool{Root: workspace},
		&LsTool{Root: workspace},
		&GlobTool{Root: workspace},
		&GrepTool{Root: workspace},
		&WriteTool{Root: workspace},
		&EditTool{Root: workspace},
		&BashTool{Root: workspace},
		&AskTool{},
	)
}

// JSONSchema helper
func jsonSchema(props map[string]any, required []string) map[string]any {
	if required == nil {
		required = []string{}
	}
	return map[string]any{
		"type":       "object",
		"properties": props,
		"required":   required,
	}
}

// secureJoin resolves p (relative) against root and ensures it stays within root.
// It rejects absolute paths, traversal via "..", and symlink escapes (best-effort).
func secureJoin(root, p string) (string, error) {
	if p == "" {
		return "", errors.New("path is empty")
	}
	if filepath.IsAbs(p) || strings.HasPrefix(p, "/") || strings.HasPrefix(p, "\\") {
		return "", fmt.Errorf("absolute paths not allowed: %q", p)
	}
	clean := filepath.Clean(filepath.FromSlash(p))
	if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path outside workspace: %q", p)
	}
	// Also reject any ".." segment inside (e.g. a/../b/../..)
	parts := strings.Split(clean, string(filepath.Separator))
	for _, part := range parts {
		if part == ".." {
			return "", fmt.Errorf("path outside workspace: %q", p)
		}
	}
	full := filepath.Join(root, clean)
	rel, err := filepath.Rel(root, full)
	if err != nil {
		return "", fmt.Errorf("path outside workspace: %w", err)
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path outside workspace: %q", p)
	}
	// Symlink escape check (best-effort, only if target exists)
	if real, err := filepath.EvalSymlinks(full); err == nil {
		// Also eval root symlink for accurate comparison
		realRoot, _ := filepath.EvalSymlinks(root)
		if realRoot == "" {
			realRoot = root
		}
		rel2, err2 := filepath.Rel(realRoot, real)
		if err2 == nil && (rel2 == ".." || strings.HasPrefix(rel2, ".."+string(filepath.Separator))) {
			return "", fmt.Errorf("symlink outside workspace: %q", p)
		}
	} else {
		// If file doesn't exist, check parent dir symlink
		dir := filepath.Dir(full)
		if realDir, err := filepath.EvalSymlinks(dir); err == nil {
			realRoot, _ := filepath.EvalSymlinks(root)
			if realRoot == "" {
				realRoot = root
			}
			rel2, err2 := filepath.Rel(realRoot, realDir)
			if err2 == nil && (rel2 == ".." || strings.HasPrefix(rel2, ".."+string(filepath.Separator))) {
				return "", fmt.Errorf("parent symlink outside workspace: %q", p)
			}
		}
	}
	return full, nil
}

// writeAtomic writes data atomically via temp file + rename + fsync.
func writeAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	tmpName := tmp.Name()
	// Ensure cleanup on failure
	defer func() {
		tmp.Close()
		os.Remove(tmpName)
	}()
	if _, err := tmp.Write(data); err != nil {
		return fmt.Errorf("write temp: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		return fmt.Errorf("sync temp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close temp: %w", err)
	}
	if err := os.Chmod(tmpName, perm); err != nil {
		return fmt.Errorf("chmod: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("rename: %w", err)
	}
	// fsync dir for durability (best-effort)
	if d, err := os.Open(dir); err == nil {
		_ = d.Sync()
		d.Close()
	}
	return nil
}

// ---- View ----

type ViewTool struct{ Root string }

func (t *ViewTool) Name() string        { return "view" }
func (t *ViewTool) Description() string { return "Read file contents. Supports optional 1-based line range." }
func (t *ViewTool) Parameters() any {
	return jsonSchema(map[string]any{
		"filePath":  map[string]any{"type": "string", "description": "Path relative to workspace"},
		"lineStart": map[string]any{"type": "integer", "description": "1-based start line"},
		"lineEnd":   map[string]any{"type": "integer", "description": "1-based end line inclusive"},
	}, []string{"filePath"})
}
func (t *ViewTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", fmt.Errorf("view: context canceled: %w", err)
	}
	var a struct {
		FilePath  string `json:"filePath"`
		LineStart *int   `json:"lineStart"`
		LineEnd   *int   `json:"lineEnd"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("view: invalid args: %w", err)
	}
	if strings.TrimSpace(a.FilePath) == "" {
		return "", errors.New("view: filePath is required")
	}
	if a.LineStart != nil && *a.LineStart < 1 {
		return "", fmt.Errorf("view: lineStart must be >=1, got %d", *a.LineStart)
	}
	if a.LineEnd != nil && *a.LineEnd < 1 {
		return "", fmt.Errorf("view: lineEnd must be >=1, got %d", *a.LineEnd)
	}
	if a.LineStart != nil && a.LineEnd != nil && *a.LineStart > *a.LineEnd {
		return "", fmt.Errorf("view: lineStart %d > lineEnd %d", *a.LineStart, *a.LineEnd)
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
	if info.Size() > maxFileReadSize {
		return "", fmt.Errorf("view: file too large (%d > %d bytes)", info.Size(), maxFileReadSize)
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", fmt.Errorf("view: %w", err)
	}
	lines := strings.Split(string(b), "\n")
	start := 1
	end := len(lines)
	if a.LineStart != nil {
		start = *a.LineStart
	}
	if a.LineEnd != nil {
		end = *a.LineEnd
	}
	if start < 1 {
		start = 1
	}
	if end > len(lines) {
		end = len(lines)
	}
	if start > len(lines) {
		return "", fmt.Errorf("view: file has %d lines, start %d out of range", len(lines), start)
	}
	w := strings.Builder{}
	pad := len(fmt.Sprintf("%d", end))
	for i := start; i <= end; i++ {
		fmt.Fprintf(&w, "%*d: %s", pad, i, lines[i-1])
		if i < end {
			w.WriteString("\n")
		}
	}
	slog.Debug("view", "path", a.FilePath, "lines", end-start+1)
	return w.String(), nil
}

// ---- Ls ----

type LsTool struct{ Root string }

func (t *LsTool) Name() string        { return "ls" }
func (t *LsTool) Description() string { return "List directory contents." }
func (t *LsTool) Parameters() any {
	return jsonSchema(map[string]any{
		"directoryPath": map[string]any{"type": "string", "description": "Directory, default '.'"},
	}, nil)
}
func (t *LsTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", fmt.Errorf("ls: context canceled: %w", err)
	}
	var a struct {
		DirectoryPath *string `json:"directoryPath"`
	}
	if len(args) > 0 && string(args) != "null" && strings.TrimSpace(string(args)) != "" {
		if err := json.Unmarshal(args, &a); err != nil {
			return "", fmt.Errorf("ls: invalid args: %w", err)
		}
	}
	dir := "."
	if a.DirectoryPath != nil && strings.TrimSpace(*a.DirectoryPath) != "" {
		dir = *a.DirectoryPath
	}
	p, err := secureJoin(t.Root, dir)
	if err != nil {
		// Allow "." to be root even if secureJoin rejects? "." is valid
		if dir == "." {
			p = t.Root
		} else {
			return "", fmt.Errorf("ls: %w", err)
		}
	}
	entries, err := os.ReadDir(p)
	if err != nil {
		return "", fmt.Errorf("ls: %w", err)
	}
	if len(entries) == 0 {
		return "Directory is empty.", nil
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() {
			out = append(out, e.Name()+"/")
		} else {
			out = append(out, e.Name())
		}
	}
	return strings.Join(out, "\n"), nil
}

// ---- Glob ----

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
	// Validate pattern doesn't try to escape via absolute or ..
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

// ---- Grep (ripgrep) ----

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
	// Verify dir exists and is dir
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
		// Skip binary by extension heuristic
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
				// Truncate long lines
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

// ---- Write ----

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
		return "", fmt.Errorf("write: context canceled: %w", err)
	}
	var a struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("write: invalid args: %w", err)
	}
	a.FilePath = strings.TrimSpace(a.FilePath)
	if a.FilePath == "" {
		return "", errors.New("write: filePath is required")
	}
	if len(a.Content) > maxWriteSize {
		return "", fmt.Errorf("write: content too large (%d > %d bytes)", len(a.Content), maxWriteSize)
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", fmt.Errorf("write: %w", err)
	}
	if err := writeAtomic(p, []byte(a.Content), 0o644); err != nil {
		return "", fmt.Errorf("write: %w", err)
	}
	slog.Info("write", "path", a.FilePath, "bytes", len(a.Content))
	return fmt.Sprintf("Wrote %d bytes to %s", len(a.Content), a.FilePath), nil
}

// ---- Edit ----

type EditTool struct{ Root string }

func (t *EditTool) Name() string        { return "edit" }
func (t *EditTool) Description() string { return "Replace exact text block in a file. oldText must appear exactly once." }
func (t *EditTool) Parameters() any {
	return jsonSchema(map[string]any{
		"filePath": map[string]any{"type": "string"},
		"oldText":  map[string]any{"type": "string"},
		"newText":  map[string]any{"type": "string"},
	}, []string{"filePath", "oldText", "newText"})
}
func (t *EditTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", fmt.Errorf("edit: context canceled: %w", err)
	}
	var a struct {
		FilePath string `json:"filePath"`
		OldText  string `json:"oldText"`
		NewText  string `json:"newText"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("edit: invalid args: %w", err)
	}
	a.FilePath = strings.TrimSpace(a.FilePath)
	if a.FilePath == "" {
		return "", errors.New("edit: filePath is required")
	}
	if a.OldText == "" {
		return "", errors.New("edit: oldText must be non-empty")
	}
	if len(a.NewText) > maxWriteSize {
		return "", fmt.Errorf("edit: newText too large (%d > %d)", len(a.NewText), maxWriteSize)
	}
	p, err := secureJoin(t.Root, a.FilePath)
	if err != nil {
		return "", fmt.Errorf("edit: %w", err)
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", fmt.Errorf("edit: %w", err)
	}
	if len(b) > maxWriteSize {
		return "", fmt.Errorf("edit: file too large (%d > %d)", len(b), maxWriteSize)
	}
	content := string(b)
	count := strings.Count(content, a.OldText)
	if count == 0 {
		return "", fmt.Errorf("edit: oldText not found")
	}
	if count > 1 {
		return "", fmt.Errorf("edit: oldText matched %d times, must be unique", count)
	}
	content = strings.Replace(content, a.OldText, a.NewText, 1)
	if len(content) > maxWriteSize {
		return "", fmt.Errorf("edit: resulting file too large (%d > %d)", len(content), maxWriteSize)
	}
	if err := writeAtomic(p, []byte(content), 0o644); err != nil {
		return "", fmt.Errorf("edit: %w", err)
	}
	slog.Info("edit", "path", a.FilePath)
	return fmt.Sprintf("Edited %s", a.FilePath), nil
}

// ---- Bash ----

type BashTool struct{ Root string }

func (t *BashTool) Name() string        { return "bash" }
func (t *BashTool) Description() string { return "Execute a shell command in the workspace. Returns stdout+stderr. Timeout 1s-120s." }
func (t *BashTool) Parameters() any {
	return jsonSchema(map[string]any{
		"command": map[string]any{"type": "string", "description": "Shell command"},
		"timeout": map[string]any{"type": "integer", "description": "Timeout ms, default 30000, min 1000 max 120000"},
	}, []string{"command"})
}
func (t *BashTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", fmt.Errorf("bash: context canceled: %w", err)
	}
	var a struct {
		Command string `json:"command"`
		Timeout *int   `json:"timeout"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("bash: invalid args: %w", err)
	}
	a.Command = strings.TrimSpace(a.Command)
	if a.Command == "" {
		return "", errors.New("bash: command is required")
	}
	if len(a.Command) > maxCommandLength {
		return "", fmt.Errorf("bash: command too long (%d > %d)", len(a.Command), maxCommandLength)
	}
	if a.Timeout != nil {
		if *a.Timeout < 1000 || *a.Timeout > 120000 {
			return "", fmt.Errorf("bash: timeout must be 1000..120000 ms, got %d", *a.Timeout)
		}
	}
	slog.Info("bash", "command", a.Command, "dir", t.Root)
	return runShell(ctx, t.Root, a.Command, a.Timeout)
}

// ---- Ask ----

type AskTool struct{}

func (t *AskTool) Name() string        { return "askQuestion" }
func (t *AskTool) Description() string { return "Ask the user a clarifying question. Use when requirements are ambiguous." }
func (t *AskTool) Parameters() any {
	return jsonSchema(map[string]any{
		"question": map[string]any{"type": "string"},
		"options":  map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
	}, []string{"question"})
}
func (t *AskTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	var a struct {
		Question string   `json:"question"`
		Options  []string `json:"options"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", fmt.Errorf("askQuestion: invalid args: %w", err)
	}
	a.Question = strings.TrimSpace(a.Question)
	if a.Question == "" {
		return "", errors.New("askQuestion: question is required")
	}
	return fmt.Sprintf("QUESTION: %s | OPTIONS: %s", a.Question, strings.Join(a.Options, ", ")), nil
}
