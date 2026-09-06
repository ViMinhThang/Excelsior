# Excelsior — GoAI-powered coding agent (Go)

Library + CLI coding agent with first-class [DeepSeek](https://api.deepseek.com) support through [GoAI](https://goai.sh/). GoAI owns provider HTTP, SSE streaming, retry handling, and provider-specific message formats.

## Quick start

```bash
export DEEPSEEK_API_KEY=sk-...
go build -o excelsior ./cmd/excelsior
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

## Documentation

- **GoDoc**: `go doc excelsior/pkg/agent`, `go doc excelsior/pkg/llm`, etc. — every exported symbol is documented.
- **Architecture**: [`ARCHITECTURE.md`](ARCHITECTURE.md) — dependency graph and invariants.
- **CLI help**: `./excelsior --help`, `./excelsior run --help`, `./excelsior tui --help`, `./excelsior engine --help`.
- **Package docs**: each `pkg/*/doc.go` has overview + examples; e.g. `pkg/agent/doc.go`, `pkg/llm/doc.go`.

## Project layout

```
cmd/excelsior   — cobra CLI (streaming, tool loop, TUI/engine subcommands)
pkg/agent       — library: agentic loop (importable) — see pkg/agent/doc.go
pkg/llm         — GoAI-backed DeepSeek adapter — pkg/llm/doc.go
pkg/tools       — tool registry + 8 core tools — pkg/tools/doc.go
pkg/session     — atomic JSON session store (.excelsior/sessions) — pkg/session/doc.go
pkg/config      — env + flag config — pkg/config/doc.go
pkg/protocol    — versioned WS envelope (v1) for engine↔clients — pkg/protocol/doc.go
pkg/engine      — WebSocket hub owning agent + broadcasting — pkg/engine/doc.go
pkg/tui         — Bubble Tea interactive UI — pkg/tui/doc.go
pkg/util        — shared helpers (Truncate, WriteAtomic) — pkg/util/doc.go
```

Each package has a `doc.go` with package-level documentation; run `go doc ./pkg/...` for details.

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
