package engine

import (
	"log/slog"

	"excelsior/pkg/agent"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/tools"
)

// AgentFactory abstracts agent instantiation, enabling unit testing of the WebSocket engine.
type AgentFactory interface {
	NewAgent(model, workspace string) (agent.Runner, error)
}

// DefaultAgentFactory creates standard Agent instances configured with default tools and LLM client.
type DefaultAgentFactory struct {
	Config config.Config
	Logger *slog.Logger
}

// NewAgent creates a new agent.Runner instance using the configured LLM and default tool registry.
func (f *DefaultAgentFactory) NewAgent(model, workspace string) (agent.Runner, error) {
	if model == "" {
		model = f.Config.Model
	}
	if model == "" {
		model = config.DefaultModel
	}
	client := &llm.Client{
		APIKey:  f.Config.APIKey,
		BaseURL: f.Config.BaseURL,
		Model:   model,
		Logger:  f.Logger,
	}
	return &agent.Agent{
		LLM:    client,
		Tools:  tools.DefaultRegistry(workspace),
		System: agent.DefaultSystemPrompt,
		Logger: f.Logger,
	}, nil
}
