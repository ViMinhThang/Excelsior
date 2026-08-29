## 2026-08-29T13:43:32Z

You are Explorer for Milestone 2 (m2_explorer).
Working Directory: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m2_explorer
Project Scope: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\PROJECT.md
Original Request: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\ORIGINAL_REQUEST.md

Your Mission for Milestone 2:
Design the architectural decoupling and interface abstractions for:
1. `pkg/config`: Remove `pkg/llm` import from `pkg/config/config.go`. Move model resolution / normalization logic so `config` does not depend on `llm`.
2. `pkg/session`: Define `session.Store` interface in `pkg/session/store.go`:
   ```go
   type Store interface {
       Save(rec Record) error
       Load(id string) (Record, error)
       List() ([]SessionMeta, error)
       Delete(id string) error
       Latest() (Record, error)
   }
   ```
   Provide `DirStore` (filesystem implementation) and `MemoryStore` (thread-safe in-memory implementation for testing). Update all callers in `pkg/engine` and `cmd/excelsior`.
3. `pkg/engine`: Introduce `AgentFactory` or `ChatRunner` interface in `pkg/engine/engine.go` or `handlers.go` so `chat_handler.go` does not hardcode concrete `agent.Agent` instantiation, enabling full mockability of the WebSocket engine.
4. `pkg/tui`: Remove the package-global `activeProgram atomic.Pointer[tea.Program]` in `pkg/tui/run.go` and `start.go`. Provide an explicit `AskHandler` or UI sink struct passed to the runner.
5. `pkg/llm`: Formalize `llm.Provider` interface in `pkg/llm/llm.go`.

Provide complete code blueprints, interface signatures, file structures, and caller migration plans.
Write your analysis and plan to `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m2_explorer\analysis.md` and `handoff.md`.
Notify orchestrator when done.
