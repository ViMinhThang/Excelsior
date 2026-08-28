package tools

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
)

// Standard resource limit constants
const (
	MaxFileReadSize  = 5 << 20  // 5 MB
	MaxWriteSize     = 10 << 20 // 10 MB
	MaxGrepFileSize  = 2 << 20  // 2 MB
	MaxGrepResults   = 200      // maximum match lines returned
	MaxCommandLength = 8 << 10  // 8 KB command length cap

	maxFileReadSize  = MaxFileReadSize
	maxWriteSize     = MaxWriteSize
	maxGrepFileSize  = MaxGrepFileSize
	maxGrepResults   = MaxGrepResults
	maxCommandLength = MaxCommandLength
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
func (r *Registry) Get(name string) (Tool, bool) {
	t, ok := r.tools[name]
	return t, ok
}

// All returns all registered tools as a slice.
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
