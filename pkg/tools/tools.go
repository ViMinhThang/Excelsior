package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
		workspace, _ = os.Getwd()
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
func (t *ViewTool) Execute(_ context.Context, args json.RawMessage) (string, error) {
	var a struct {
		FilePath  string `json:"filePath"`
		LineStart *int   `json:"lineStart"`
		LineEnd   *int   `json:"lineEnd"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", err
	}
	p := resolve(t.Root, a.FilePath)
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
func (t *LsTool) Execute(_ context.Context, args json.RawMessage) (string, error) {
	var a struct {
		DirectoryPath *string `json:"directoryPath"`
	}
	if len(args) > 0 && string(args) != "null" {
		_ = json.Unmarshal(args, &a)
	}
	dir := "."
	if a.DirectoryPath != nil {
		dir = *a.DirectoryPath
	}
	p := resolve(t.Root, dir)
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
func (t *GlobTool) Execute(_ context.Context, args json.RawMessage) (string, error) {
	var a struct{ Pattern string `json:"pattern"` }
	if err := json.Unmarshal(args, &a); err != nil {
		return "", err
	}
	if filepath.IsAbs(a.Pattern) || strings.Contains(a.Pattern, "..") {
		return "", fmt.Errorf("glob: pattern outside workspace")
	}
	// walk + match using filepath.Match per segment - simple impl using Glob + walk
	matches, err := filepath.Glob(filepath.Join(t.Root, a.Pattern))
	if err != nil {
		return "", err
	}
	// Also handle ** by walking if Glob didn't cover
	if len(matches) == 0 && strings.Contains(a.Pattern, "**") {
		matches = walkGlob(t.Root, a.Pattern)
	}
	if len(matches) == 0 {
		return "No files matched.", nil
	}
	rel := make([]string, 0, len(matches))
	for _, m := range matches {
		r, _ := filepath.Rel(t.Root, m)
		rel = append(rel, filepath.ToSlash(r))
	}
	return strings.Join(rel, "\n"), nil
}

func walkGlob(root, pattern string) []string {
	var out []string
	_ = filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			if info != nil && info.IsDir() && (info.Name() == ".git" || info.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)
		ok, _ := filepath.Match(pattern, rel)
		// fallback: simple contains for **/*.ext
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
func (t *GrepTool) Description() string { return "Search file contents by regex (ripgrep-style). Use for codebase search." }
func (t *GrepTool) Parameters() any {
	return jsonSchema(map[string]any{
		"pattern": map[string]any{"type": "string"},
		"path":    map[string]any{"type": "string", "description": "Subpath, default '.'"},
	}, []string{"pattern"})
}
func (t *GrepTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	var a struct {
		Pattern string  `json:"pattern"`
		Path    *string `json:"path"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", err
	}
	dir := t.Root
	if a.Path != nil && *a.Path != "" {
		dir = resolve(t.Root, *a.Path)
	}
	// Use Go's grep via walking to avoid rg dependency; fallback to rg if available
	return grepWalk(ctx, a.Pattern, dir, t.Root)
}

func grepWalk(_ context.Context, pattern, dir, root string) (string, error) {
	// try rg first for speed if installed
	// lightweight: just use Go regex walk (no external dep required for library)
	// Keep it simple: use Go regexp
	importRegex := func() string { return pattern }
	_ = importRegex
	// actual walk
	var out []string
	count := 0
	_ = filepath.Walk(dir, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			if info != nil && info.IsDir() && (info.Name() == ".git" || info.Name() == "node_modules" || info.Name() == ".excelsior") {
				return filepath.SkipDir
			}
			return nil
		}
		// skip binary
		b, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		if len(b) > 2_000_000 {
			return nil
		}
		text := string(b)
		// simple substring search for now; agent can use regex but we do contains for speed
		// Use proper regexp if pattern looks like regex
		lines := strings.Split(text, "\n")
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)
		for i, line := range lines {
			if strings.Contains(line, pattern) {
				out = append(out, fmt.Sprintf("%s:%d:%s", rel, i+1, line))
				count++
				if count >= 200 {
					return filepath.SkipAll
				}
			}
		}
		return nil
	})
	if len(out) == 0 {
		return "No matches.", nil
	}
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
func (t *WriteTool) Execute(_ context.Context, args json.RawMessage) (string, error) {
	var a struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", err
	}
	p := resolve(t.Root, a.FilePath)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(p, []byte(a.Content), 0o644); err != nil {
		return "", err
	}
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
func (t *EditTool) Execute(_ context.Context, args json.RawMessage) (string, error) {
	var a struct {
		FilePath string `json:"filePath"`
		OldText  string `json:"oldText"`
		NewText  string `json:"newText"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", err
	}
	p := resolve(t.Root, a.FilePath)
	b, err := os.ReadFile(p)
	if err != nil {
		return "", err
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
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		return "", err
	}
	return fmt.Sprintf("Edited %s", a.FilePath), nil
}

// ---- Bash ----

type BashTool struct{ Root string }

func (t *BashTool) Name() string        { return "bash" }
func (t *BashTool) Description() string { return "Execute a shell command in the workspace. Returns stdout+stderr." }
func (t *BashTool) Parameters() any {
	return jsonSchema(map[string]any{
		"command": map[string]any{"type": "string", "description": "Shell command"},
		"timeout": map[string]any{"type": "integer", "description": "Timeout ms, default 30000"},
	}, []string{"command"})
}
func (t *BashTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	var a struct {
		Command string `json:"command"`
		Timeout *int   `json:"timeout"`
	}
	if err := json.Unmarshal(args, &a); err != nil {
		return "", err
	}
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
		return "", err
	}
	// In non-interactive mode we return a signal; the agent loop will surface it via callback.
	return fmt.Sprintf("QUESTION: %s | OPTIONS: %s", a.Question, strings.Join(a.Options, ", ")), nil
}

func resolve(root, p string) string {
	if filepath.IsAbs(p) {
		return filepath.Clean(p)
	}
	return filepath.Join(root, filepath.FromSlash(p))
}
