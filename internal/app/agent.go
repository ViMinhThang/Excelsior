package app

import (
	"log/slog"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

// NewAgent is the shared local agent composition point for CLI, TUI, and the
// WebSocket transport fallback.
func NewAgent(cfg config.Config, workspace, model, system string, logger *slog.Logger) *agent.Agent {
	if logger == nil {
		logger = slog.Default()
	}
	return &agent.Agent{
		LLM:    &llm.Client{APIKey: cfg.APIKey, BaseURL: cfg.BaseURL, Model: model, Logger: logger},
		Tools:  tools.DefaultRegistry(workspace),
		System: system,
		Logger: logger,
	}
}
