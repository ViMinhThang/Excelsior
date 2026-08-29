# Architecture — excelsior

```
cmd/excelsior  →  pkg/config → pkg/llm ─┐
                →  pkg/tools ────────┤
                →  pkg/session ──────┤→ pkg/agent (loop) → pkg/tui (Bubble Tea)
                →  pkg/protocol ─────┤→ pkg/engine (WS hub) → clients
                                     └→ pkg/llm (SSE)
                         pkg/util (Truncate, WriteAtomic) ← shared
```

**Rules:**
- `pkg/*` never imports `cmd/*` or `internal/*`.
- `pkg/agent` depends on `llm.Port`/`tools.Port` interfaces (ports-and-adapters), enabling `httptest`/`fakeTools` tests.
- `pkg/tools` is workspace-jailed (`secureJoin`, symlink-aware) and atomic (temp+rename+fsync).
- `pkg/llm` retries `429/5xx` with exponential backoff; `pkg/session` is `0700/0600` atomic JSON (legacy JSONL compat) with corruption skip.
- `pkg/protocol` defines the versioned `v1` envelope; `pkg/engine` is the WS hub that owns the agent and broadcasts `StreamEvent`s.

**TUI:** `model` copies by value (Bubble Tea), so `*strings.Builder` for streams, `activeProgram.Send` for `askQuestion` overlay (3 options + `textinput`).

**Package docs:** see `pkg/*/doc.go` for each layer's contract; `go doc ./pkg/...` renders them.

**Dependency graph truth:** `pkg/engine` imports `pkg/agent` + `pkg/protocol` + `pkg/config`; `pkg/tui` imports `pkg/agent` + `pkg/llm` + `pkg/engine` (WS client); `pkg/util` is leaf with no heavy deps.
