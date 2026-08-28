# Architecture — excelsior

```
cmd/excelsior  →  pkg/config → pkg/llm ─┐
                →  pkg/tools ────────┤
                →  pkg/session ──────┤→ pkg/agent (loop) → pkg/tui (Bubble Tea)
                                     └→ pkg/llm (SSE)
```

**Rule:** `pkg/*` never imports `cmd/*` or `internal/*`; `pkg/agent` depends on `llm.Port`/`tools.Port` interfaces, enabling `httptest`/`fakeTools` tests. `pkg/tools` is workspace-jailed (`secureJoin`); `pkg/llm` retries `429/5xx`; `pkg/session` is `0700/0600` JSONL with corruption skip.

**TUI:** `model` copies by value (Bubble Tea), so `*strings.Builder` for streams, `activeProgram.Send` for `askQuestion` overlay (3 options + `textinput`).
