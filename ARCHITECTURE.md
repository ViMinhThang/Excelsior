# Architecture — excelsior

```
cmd/excelsior → internal/app → pkg/agent → pkg/llm (GoAI adapter)
                              └→ pkg/tools

pkg/engine (WebSocket transport)
  ├→ internal/chat → pkg/agent + pkg/session
  ├→ internal/sessions → pkg/session
  ├→ internal/permissions → pkg/config
  └→ pkg/protocol → clients

pkg/util (Truncate, WriteAtomic) ← shared
```

**Rules:**
- `pkg/*` never imports `cmd/*` or `internal/*`.
- `pkg/agent` depends on `llm.Port`/`tools.Port` interfaces (ports-and-adapters), enabling `httptest`/`fakeTools` tests.
- `pkg/tools` is workspace-jailed (`secureJoin`, symlink-aware) and atomic (temp+rename+fsync).
- `pkg/llm` adapts GoAI's DeepSeek provider to the local `llm.Provider` port; GoAI owns HTTP, SSE parsing, and retry handling. `pkg/session` is `0700/0600` atomic JSON (legacy JSONL compat) with corruption skip.
- `pkg/protocol` defines the versioned `v1` envelope; `pkg/engine` translates WebSocket messages and owns connection lifecycle, while `internal/chat`, `internal/sessions`, and `internal/permissions` own application behavior. Authenticated sessions remain scoped by user.

**TUI:** `model` copies by value (Bubble Tea), so `*strings.Builder` for streams, `activeProgram.Send` for `askQuestion` overlay (3 options + `textinput`).

**Package docs:** see `pkg/*/doc.go` for each layer's contract; `go doc ./pkg/...` renders them.

**Dependency graph truth:** `pkg/engine` is still the remaining transport-heavy package, but application operations are moving to `internal/*`. `internal/app` composes local agents; `internal/chat` owns turns and persistence; `internal/sessions` owns session operations; `internal/permissions` owns policy resolution. `pkg/tui` imports `pkg/agent` + `pkg/llm` + `pkg/engine` (WS client); `pkg/util` is leaf with no heavy deps.
