package tools

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
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

const (
	maxFileReadSize  = 5 << 20
	maxWriteSize     = 10 << 20
	maxGrepFileSize  = 2 << 20
	maxGrepResults   = 200
	maxCommandLength = 8 << 10
)
