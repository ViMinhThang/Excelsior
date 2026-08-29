// Package agent owns the tool-call loop that drives an LLM through
// alternating model and tool turns until a stop condition.
//
// Dependencies are expressed as small interfaces (LLM, ToolRegistry) so the
// package can be tested with fakes and used by both CLI and TUI. Streaming
// is push-based via [RunOptions.OnEvent]; cancellation is via context.
//
// Basic usage:
//
//	cfg := config.FromEnv()
//	client := &llm.Client{APIKey: cfg.APIKey, Model: cfg.Model}
//	ag := &agent.Agent{LLM: client, Tools: tools.DefaultRegistry(cfg.Workspace)}
//	msg, err := ag.Run(ctx, agent.RunOptions{
//	    Messages: []llm.Message{{Role: "user", Content: "fix the bug"}},
//	    OnEvent: func(ev agent.StreamEvent) { fmt.Println(ev.Type, ev.Text) },
//	})
package agent
