# Milestone 2 Implementation Changes: Core Architecture Decoupling & Interface Abstractions

## 1. Executive Summary

Milestone 2 establishes strict architectural decoupling and formal interface abstractions across the 5 core subsystem layers of Excelsior:
1. **Config Layer**: Removed reverse dependency on `pkg/llm`. `pkg/config` is now a pure L0 layer with 0 upstream dependencies.
2. **Session Layer**: Introduced `session.Store` interface, `Record`, and `SessionMeta` models, backed by two first-class implementations: `DirStore` (atomic JSONL disk persistence) and `MemoryStore` (mutex-protected in-memory store with deep copy protection).
3. **Engine & Agent Layer**: Introduced `agent.Runner` interface and `engine.AgentFactory` (`DefaultAgentFactory` and mockable), enabling 100% in-memory and mock testing of the WebSocket engine.
4. **TUI Layer**: Completely eliminated package-global `activeProgram atomic.Pointer[tea.Program]`. Implemented `AskDispatcher` and `UISink` attached explicitly per Bubble Tea program run.
5. **LLM Layer**: Formalized `llm.Provider` interface with compile-time conformance check `var _ Provider = (*Client)(nil)`.

---

## 2. Detailed Subsystem Changes

### 2.1 `pkg/config` & `pkg/llm` Decoupling
- **`pkg/config/config.go`**:
  - Removed `import "excelsior/pkg/llm"`.
  - Localized `modelAliases` map (`deepseek-v4-pro`, `v4-pro`, `v4-flash`).
  - Implemented `ResolveModel(m string) string` locally in `pkg/config`.
- **`pkg/llm/types.go`**:
  - Imported `excelsior/pkg/config`.
  - Forwarded `llm.ResolveModel` to `config.ResolveModel(m)` to preserve full backward compatibility for existing callers.

### 2.2 `pkg/session` Store Abstraction & In-Memory Store
- **`pkg/session/store.go`** (New File):
  - Defined `type Store interface` with methods: `Save(rec Record) error`, `Load(id string) (Record, error)`, `List() ([]SessionMeta, error)`, `Delete(id string) error`, `Latest() (Record, error)`.
  - Defined `Record` domain model: `ID`, `Title`, `CreatedAt`, `UpdatedAt`, `Messages []llm.Message`.
  - Defined `SessionMeta` summary model: `ID`, `Title`, `CreatedAt`, `UpdatedAt`, `MsgCount int`.
- **`pkg/session/session.go`**:
  - Refactored into `DirStore` implementing `session.Store`.
  - Provided `NewDirStore(dir string)` and `NewStore(dir string)` constructors.
  - Added compile-time check `var _ Store = (*DirStore)(nil)`.
  - Maintained backward-compatible helpers: `SaveWithTitle`, `LoadRecord`, `Rename`, `Prune`.
- **`pkg/session/memstore.go`** (New File):
  - Implemented `MemoryStore` implementing `session.Store`.
  - Thread-safe using `sync.RWMutex`.
  - Protects against external mutation bugs via deep-copying `Messages` slices on both read and write operations.
  - Added `Clear()` for hermetic test lifecycle.
  - Added compile-time check `var _ Store = (*MemoryStore)(nil)`.
- **`pkg/session/session_test.go`**:
  - Updated tests for `DirStore` and `Store` interface methods.
- **`pkg/session/memstore_test.go`** (New File):
  - Added unit test suite for `MemoryStore` covering Save/Load, deep copying, List ordering by `UpdatedAt` descending, Latest, Delete idempotence, ID sanitization, Clear, and 100-goroutine concurrent access.

### 2.3 `pkg/engine` & `pkg/agent` Factory and Runner Abstraction
- **`pkg/agent/agent.go`**:
  - Defined `type Runner interface { RunWithHistory(ctx context.Context, opts RunOptions) (*RunResult, error) }`.
  - Added compile-time check `var _ Runner = (*Agent)(nil)`.
  - Aliased `type LLM = llm.Provider`.
- **`pkg/engine/factory.go`** (New File):
  - Defined `type AgentFactory interface { NewAgent(model, workspace string) (agent.Runner, error) }`.
  - Implemented `DefaultAgentFactory` which creates standard `*agent.Agent` instances with `*llm.Client` and `tools.DefaultRegistry`.
- **`pkg/engine/hub.go`**:
  - Added `AgentFactory AgentFactory` and `SessionStore session.Store` fields to `Hub` struct.
- **`pkg/engine/conn.go`**:
  - Updated `(c *Conn) sessionStore() session.Store` to return `c.hub.SessionStore` if configured, or default to `session.NewDirStore(c.sessionDir())`.
  - Added `(c *Conn) getAgent(model string) (agent.Runner, error)` using `c.hub.AgentFactory`.
- **`pkg/engine/chat_handler.go`**:
  - Updated `handleChat` and `loadHistory` to use `c.getAgent(req.Model)` and `c.sessionStore()`.
- **`pkg/engine/handlers.go`**:
  - Updated all session handlers (`session.list`, `session.data`, `session.create`, `session.delete`, `session.rename`) to operate against the `session.Store` interface.
- **`pkg/engine/engine_test.go`**:
  - Added `TestHub_MockAgentFactory` testing WebSocket `chat.req` flow against a `mockRunner` without network or disk.
  - Added `TestHub_MemorySessionStore` testing in-memory WebSocket session CRUD lifecycle against `MemoryStore`.

### 2.4 `pkg/tui` Decoupling & Global State Elimination
- **`pkg/tui/ask.go`**:
  - Defined `type UISink interface { Send(msg tea.Msg) }`.
  - Defined `AskDispatcher` with atomic sink binding.
  - Provided `(d *AskDispatcher) Handler(parentCtx context.Context) tools.QuestionHandler`.
- **`pkg/tui/model.go`**:
  - Updated `Config` struct to use `Agent agent.Runner` and `AskDispatcher *AskDispatcher`.
- **`pkg/tui/run.go`**:
  - Removed package-global `var activeProgram atomic.Pointer[tea.Program]`.
  - Explicitly registered Bubble Tea program as `UISink` via `cfg.AskDispatcher.SetSink(p)`.
- **`pkg/tui/start.go`**:
  - Updated `startAgent` to retrieve `QuestionHandler` from `m.cfg.AskDispatcher.Handler(ctx)`.
  - Removed obsolete global `tuiAskHandler`.
- **`pkg/tui/update.go`**:
  - Added type assertion in `/model` command to set `Model` on `*agent.Agent` if present.
- **`pkg/tui/ask_test.go`** (New File):
  - Added unit tests for `AskDispatcher`: no-sink error handling, UI message dispatch and response receipt, context cancellation timeout, and sink unbinding.

### 2.5 `pkg/llm` Provider Interface Formalization
- **`pkg/llm/provider.go`** (New File):
  - Defined `type Provider interface { StreamChat(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error); ModelName() string }`.
  - Added compile-time check `var _ Provider = (*Client)(nil)`.

### 2.6 `cmd/excelsior` CLI Adaptation
- **`cmd/excelsior/main.go`**:
  - Updated session save and load calls in `runAgent` and `loadHistory` to use `session.NewDirStore` and `session.Record`.

---

## 3. Verification Commands and Results

| Command | Status | Result |
|---|---|---|
| `go build ./...` | **PASS** | 0 errors |
| `go vet ./...` | **PASS** | 0 warnings / diagnostics |
| `go test -v ./...` | **PASS** | All unit, integration, stress, and challenge tests pass |
| `go build ./cmd/excelsior` | **PASS** | Binary compiles cleanly |
