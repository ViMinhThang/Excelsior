## 2026-08-29T13:46:29Z

You are the Specialist Implementation Worker for Milestone 2 (m2_worker).
Working Directory: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m2_worker
Project Scope: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\PROJECT.md
Original Request: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\ORIGINAL_REQUEST.md

Specifications to read and follow:
- `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m2_explorer\analysis.md`
- `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m2_explorer\handoff.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks for Milestone 2:
1. `pkg/config`:
   - Decouple `pkg/config` from `pkg/llm`. Localize `modelAliases` and `ResolveModel(m string) string` in `pkg/config/config.go`. Remove `import "excelsior/pkg/llm"`.
   - Update `pkg/llm/client.go` or `pkg/llm/llm.go` to forward `llm.ResolveModel` to `config.ResolveModel` for backward compatibility.
2. `pkg/session`:
   - Define `session.Store` interface in `pkg/session/store.go` (`Save`, `Load`, `List`, `Delete`, `Latest`).
   - Define `SessionMeta` struct and `Record` struct.
   - Refactor `session.go` into `DirStore` (filesystem implementation implementing `session.Store`). Keep `type Store = DirStore` or `NewDirStore(dir)` / `New(dir)` constructor.
   - Implement `MemoryStore` in `pkg/session/memstore.go` (mutex-protected in-memory implementation of `session.Store`).
   - Add comprehensive unit tests in `pkg/session/session_test.go` and `memstore_test.go`.
3. `pkg/engine`:
   - Define `AgentFactory` interface in `pkg/engine/factory.go`:
     ```go
     type AgentFactory interface {
         NewAgent(model string, ws string) (agent.Runner, error)
     }
     ```
   - Define `agent.Runner` interface in `pkg/agent/agent.go` (`RunWithHistory(ctx context.Context, opts RunOptions) (*RunResult, error)` or `Run(...)`).
   - Update `Hub` / `chat_handler.go` in `pkg/engine` to use `AgentFactory` and `session.Store` interface, enabling full dependency injection and mockability.
   - Provide `DefaultAgentFactory` as standard factory.
4. `pkg/tui`:
   - Remove package-global `var activeProgram atomic.Pointer[tea.Program]` from `pkg/tui/run.go` and `start.go`.
   - Implement `AskDispatcher` / `UISink` so interactive question prompts are routed explicitly without global mutable state.
5. `pkg/llm`:
   - Define `Provider` interface in `pkg/llm/llm.go` with compile-time check: `var _ Provider = (*Client)(nil)`.
6. Run verification:
   - `go build ./...`
   - `go vet ./...`
   - `go test -v ./...`
   - `go build ./cmd/excelsior`
7. Document all changes in `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m2_worker\changes.md` and `handoff.md`.
8. Send completion message back to orchestrator (conversation ID: 8884cc3c-d4d3-4cb8-91b1-a31965788d96).
