package tools

import (
	"cmp"
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
)

// Resource limits for tool execution.
const (
	MaxFileReadSize  = 5 << 20  // 5 MB per view
	MaxWriteSize     = 10 << 20 // 10 MB per write
	MaxGrepFileSize  = 2 << 20  // 2 MB per file scanned
	MaxGrepResults   = 200      // maximum match lines returned by grep
	MaxCommandLength = 8 << 10  // 8 KB command length cap for bash
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

// NewRegistry initializes a Registry with the provided tools.
func NewRegistry(ts ...Tool) *Registry {
	m := make(map[string]Tool, len(ts))
	for _, t := range ts {
		m[t.Name()] = t
	}
	return &Registry{tools: m}
}

// Get retrieves a tool by name.
func (r *Registry) Get(name string) (Tool, bool) { t, ok := r.tools[name]; return t, ok }

// All returns all registered tools as a slice, sorted by name for determinism.
func (r *Registry) All() []Tool {
	out := make([]Tool, 0, len(r.tools))
	for _, t := range r.tools {
		out = append(out, t)
	}
	slices.SortFunc(out, func(a, b Tool) int { return cmp.Compare(a.Name(), b.Name()) })
	return out
}

// resolveRoot normalizes workspace to an absolute path, defaulting to cwd.
func resolveRoot(workspace string) string {
	if workspace == "" {
		if wd, err := os.Getwd(); err == nil && wd != "" {
			workspace = wd
		} else {
			slog.Warn("tools: Getwd failed, using '.'", "err", err)
			return "."
		}
	}
	if !filepath.IsAbs(workspace) {
		if abs, err := filepath.Abs(workspace); err == nil {
			workspace = abs
		}
	}
	return workspace
}

// DefaultRegistry returns the core 8 tools rooted at workspace.
func DefaultRegistry(workspace string) *Registry {
	workspace = resolveRoot(workspace)
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

// jsonSchema helper constructs standard JSON Schema objects for tool parameter definitions.
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

func isSkippedDir(name string) bool {
	switch name {
	case ".git", "node_modules", ".excelsior":
		return true
	default:
		return false
	}
}
