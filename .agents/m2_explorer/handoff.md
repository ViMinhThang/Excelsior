# Milestone 2 Handoff Report: Core Architecture Decoupling & Interface Abstractions

## 1. Observation
We conducted an exhaustive structural inspection of the codebase across `pkg/config`, `pkg/session`, `pkg/engine`, `pkg/tui`, `pkg/llm`, and `cmd/excelsior`:
- **`pkg/config/config.go:10`**: Imports `excelsior/pkg/llm` solely to call `llm.ResolveModel` at line 33 (`func ResolveModel(m string) string { return llm.ResolveModel(m) }`) and line 48 in `FromEnv()`. This represents an architectural violation of unidirectional dependency layering (base layer importing a higher-level transport layer).
- **`pkg/session/session.go:21`**: `Store` is defined as a concrete filesystem struct `type Store struct { Dir string }`. There is no interface abstraction or in-memory implementation (`MemoryStore`), preventing hermetic unit/integration testing without filesystem side-effects.
- **`pkg/engine/chat_handler.go:23-28`**: Instantiates a concrete `&agent.Agent{...}` directly inside `handleChat`, preventing mockability of agent execution during WebSocket engine testing.
- **`pkg/tui/run.go:12` & `pkg/tui/start.go:29`**: Uses a package-global variable `var activeProgram atomic.Pointer[tea.Program]` to route user question prompts from background agent goroutines to the Bubble Tea UI, creating global mutable state and preventing clean dependency injection.
- **`pkg/llm`**: Contains `*Client` but lacks a formal `llm.Provider` interface in `pkg/llm`.

## 2. Logic Chain
1. **Config Layer Localization**: By defining `modelAliases` and `ResolveModel(m string) string` directly in `pkg/config/config.go`, `pkg/config` becomes entirely self-contained with 0 upstream dependencies. `pkg/llm` (higher layer) can import `pkg/config` and forward `llm.ResolveModel`, restoring pure unidirectional flow (`cmd` -> `engine`/`tui` -> `agent` -> `llm` -> `config`).
2. **Session Storage Decoupling**: Defining `session.Store` interface in `pkg/session/store.go` (`Save(Record) error`, `Load(id) (Record, error)`, `List() ([]SessionMeta, error)`, `Delete(id) error`, `Latest() (Record, error)`) and providing both `DirStore` (atomic JSONL disk persistence) and `MemoryStore` (mutex-guarded thread-safe in-memory map) enables swappable persistence and high-speed in-memory testing across `pkg/engine` and `cmd/excelsior`.
3. **Engine Mockability via Factory**: Abstracting agent turn execution via `agent.Runner` interface (`RunWithHistory(ctx, opts) (*RunResult, error)`) and introducing `engine.AgentFactory` (`NewAgent(model, ws) (agent.Runner, error)`) in `pkg/engine` decouples the WebSocket hub and connection lifecycle from concrete agent loops. Real runs use `DefaultAgentFactory`; engine tests can inject a `MockAgentFactory`.
4. **TUI Global State Elimination**: Defining `UISink` and `AskDispatcher` with explicit sink binding per `tui.Run(cfg)` execution eliminates `var activeProgram` package-global state. `AskDispatcher.Handler(parentCtx)` returns a `tools.QuestionHandler` passed into tool execution without touching global variables.
5. **Formal LLM Provider Contract**: Defining `type Provider interface` in `pkg/llm` with `var _ Provider = (*Client)(nil)` standardizes the LLM port and aligns with `agent.LLM`.

## 3. Caveats
- `DirStore` backwards compatibility: Legacy `.jsonl` files without `UpdatedAt` or with multiple lines must continue to parse gracefully by defaulting `UpdatedAt = CreatedAt` and reading the last valid JSON line.
- `session.Store.List()` return type: returns `[]SessionMeta` which includes `MsgCount` and `UpdatedAt`, allowing lightweight session enumeration without full record loading.
- `pkg/llm.ResolveModel` should remain as a forwarding function to `config.ResolveModel` to prevent breaking existing external callers or tests.

## 4. Conclusion
The architectural blueprint for Milestone 2 provides complete, production-grade interface contracts, concrete code blueprints, and migration plans for all 5 subsystems. All designs adhere to SOLID principles, eliminate global mutable state, preserve all Milestone 1 domain error sentinels, and establish full mockability for testing.

Detailed analysis, type definitions, and complete code listings are recorded in `.agents/m2_explorer/analysis.md`.

## 5. Verification Method
1. Build verification:
   ```bash
   go build ./cmd/excelsior
   go build ./...
   ```
2. Vet & lint inspection:
   ```bash
   go vet ./...
   ```
3. Test suite execution:
   ```bash
   go test -v -race ./...
   ```
4. Specific test targets:
   - `pkg/config`: `TestResolveModel` (verifying alias resolution without `pkg/llm` import).
   - `pkg/session`: `TestStore_SaveLoad`, `TestMemoryStore_*`, `TestDirStore_*` (verifying interface conformance and thread safety).
   - `pkg/engine`: `TestHub_MockAgentFactory`, `TestHub_MemorySessionStore` (verifying full WebSocket engine mockability).
   - `pkg/tui`: `TestAskDispatcher` (verifying sink dispatch without global program state).
   - `pkg/llm`: compile-time interface check `var _ Provider = (*Client)(nil)`.
