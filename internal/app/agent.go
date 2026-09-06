package app

import (
	"log/slog"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

// NewAgent is the local CLI/TUI composition point. Transport packages should
// construct their own application services instead of reaching into this helper.
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
