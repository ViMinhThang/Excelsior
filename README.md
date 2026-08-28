# Excelsior — DeepSeek-native coding agent (Go)

Library + CLI coding agent with first-class [DeepSeek](https://api.deepseek.com) support. No OpenAI SDK abstraction — `reasoning_content`, tool-calling, and SSE streaming are handled natively.

## Quick start

```bash
export DEEPSEEK_API_KEY=sk-...
go build -o excelsior ./cmd/excelsior
./excelsior "explain this repo"
./excelsior -m deepseek-reasoner "refactor pkg/llm to add retries"
echo "add tests for pkg/tools" | ./excelsior
```

### Models

| model | usage |
|---|---|
| `deepseek-chat` (default) | V3, fast, tool-calling |
| `deepseek-reasoner` | R1, streams `reasoning_content` to stderr |

Set via `-m` / `--model` or `DEEPSEEK_MODEL` env.

## Library

```go
import (
    "excelsior/pkg/agent"
    "excelsior/pkg/config"
    "excelsior/pkg/llm"
    "excelsior/pkg/tools"
)

cfg := config.FromEnv()
client := &llm.Client{APIKey: cfg.APIKey, Model: "deepseek-chat"}
ag := &agent.Agent{
    LLM:    client,
    Tools:  tools.DefaultRegistry(workspace),
    System: agent.DefaultSystemPrompt,
}
msg, err := ag.Run(ctx, agent.RunOptions{
    Messages: []llm.Message{{Role: "user", Content: "fix the bug in main.go"}},
    OnEvent: func(ev agent.StreamEvent) {
        // ev.Type: "text" | "reasoning" | "tool_start" | "tool_result" | "done"
    },
})
```

## Tools (core 8)

`view`, `ls`, `glob`, `grep`, `write`, `edit`, `bash`, `askQuestion` — all workspace-rooted, exposed as DeepSeek function tools with JSON Schema.

## Project layout

```
cmd/excelsior   — cobra CLI (streaming, tool loop)
pkg/llm         — DeepSeek-native SSE client (no OpenAI dep)
pkg/tools       — tool registry + 8 core tools
pkg/agent       — library: agentic loop (importable)
pkg/session     — JSONL session store (.excelsior/sessions)
pkg/config      — env + flag config
```

## Env

```
DEEPSEEK_API_KEY   required
DEEPSEEK_BASE_URL  default https://api.deepseek.com
DEEPSEEK_MODEL     default deepseek-chat
```

## Build

```bash
go vet ./...
go build ./...
go test ./...
```
