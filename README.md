# Excelsior — GoAI-powered coding agent (Go)

Library + CLI coding agent with first-class [DeepSeek](https://api.deepseek.com) support through [GoAI](https://goai.sh/). GoAI owns provider HTTP, SSE streaming, retry handling, and provider-specific message formats.

## Quick start

```bash
export DEEPSEEK_API_KEY=sk-...
go build -trimpath -ldflags "-s -w" -o excelsior ./cmd/excelsior
./excelsior "explain this repo"
./excelsior -m deepseek-v4-pro "refactor pkg/llm to add retries"
echo "add tests for pkg/tools" | ./excelsior
```

### Models

| model | usage |
|---|---|
| `deepseek-v4-flash` (default) | V4 Flash, fast, reasoning |
| `deepseek-v4-pro` | V4 Pro, reasoning |

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
client := &llm.Client{APIKey: cfg.APIKey, Model: "deepseek-v4-flash"}
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

`view`, `ls`, `glob`, `grep`, `write`, `edit`, `bash`, `askQuestion` — all workspace-rooted (secureJoin, symlink-aware), exposed as DeepSeek function tools with JSON Schema. See `pkg/tools` docs for limits (MaxFileReadSize 5MB, MaxWriteSize 10MB, etc.).

## Architecture

One personal Go engine serves desktop and future mobile clients. Runs belong to the engine and survive client disconnects. Sessions use atomic workspace JSON files; access uses a single owner token. See [ARCHITECTURE.md](ARCHITECTURE.md) for protocol and lifecycle details.

```bash
./excelsior engine --workspace .
# In another terminal:
./excelsior --engine ws://localhost:17812/v1/ws --session my-chat "explain this repo"
```

Local desktop authentication is automatic. For another device, obtain the token with `excelsior engine token` and supply it in client Settings or `EXCELSIOR_ENGINE_TOKEN`. Use an encrypted private connection for remote access. `--auth` and `--db` are retired; existing database files are left untouched.

## Project layout

```text
cmd/excelsior   CLI and daemon startup
internal/app   shared agent construction
internal/chat  turn execution and persistence
internal/sessions, internal/permissions   session operations and permission policy
pkg/engine     authenticated WebSocket transport and engine-owned runs
pkg/protocol   shared message types
pkg/agent, pkg/llm, pkg/tools   agent, GoAI adapter, workspace tools
pkg/session    atomic JSON session storage
pkg/config, pkg/util   configuration and shared helpers
apps/electron  desktop shell and frontend
```

## Env

```
DEEPSEEK_API_KEY   required
DEEPSEEK_BASE_URL  default https://api.deepseek.com
DEEPSEEK_MODEL     default deepseek-v4-flash
```

## Build

```bash
go vet ./...
go build ./...
go test ./...
```
