# Project: Excelsior Codebase Elevation

## Architecture
Excelsior is an AI engineering agent with a modular Go backend (`pkg/agent`, `pkg/llm`, `pkg/tools`, `pkg/session`, `pkg/engine`, `pkg/protocol`, `pkg/config`, `pkg/tui`, `pkg/util`, `cmd/excelsior`) and desktop/web frontend interfaces (`apps/`).

The elevated architecture adheres strictly to:
1. **Unidirectional Dependency Flow**: `cmd/` -> `engine`/`tui` -> `agent` -> `llm`/`tools`/`session`/`protocol` -> `config`/`util`. Base configuration (`pkg/config`) and protocol definitions (`pkg/protocol`) never import higher-level transport packages (`pkg/llm`).
2. **Interface-Driven Ports & Adapters**:
   - `agent.LLM` and `agent.ToolRegistry`: swappable LLM transport and tool providers.
   - `session.Store`: swappable persistence interface (file-based `DirStore` and in-memory `MemoryStore` for testing).
   - `engine.AgentFactory` / `engine.Runner`: decouples WebSocket protocol dispatch from agent instantiation.
   - Explicit UI interaction interfaces replacing package-global singletons in `pkg/tui`.
3. **Typed Domain Error Hierarchy**: Every package defines structured error types and sentinel values implementing `errors.Is`, `errors.As`, and `Unwrap()`. Stringly-typed retry policies and panic calls are completely eliminated.
4. **Resilient Concurrency & Context Lifecycle**: Mutex-guarded channel lifecycles in `pkg/engine/conn.go`, clean goroutine shutdowns, cancellation propagation across streaming and tool executions, and timeout delegation to caller contexts.

```
   ┌─────────────────────────────────────────────────────────┐
   │                     cmd/excelsior                       │
   └───────────────┬─────────────────────────┬───────────────┘
                   │                         │
                   ▼                         ▼
   ┌──────────────────────────────┐  ┌───────────────────────┐
   │         pkg/engine           │  │        pkg/tui        │
   │  (WebSocket Server & Client) │  │  (Bubble Tea Display) │
   └───────────────┬──────────────┘  └───────────┬───────────┘
                   │                             │
                   ▼                             │
   ┌─────────────────────────────────────────────▼───────────┐
   │                        pkg/agent                        │
   │              (Core Iterative Execution Loop)            │
   └───────┬──────────────┬───────────────┬───────────┬──────┘
           │              │               │           │
           ▼              ▼               ▼           ▼
   ┌──────────────┐┌──────────────┐┌──────────────┐┌─────────┐
   │   pkg/llm    ││  pkg/tools   ││ pkg/session  ││pkg/proto│
   └───────┬──────┘└──────┬───────┘└──────┬───────┘└────┬────┘
           │              │               │             │
           └──────────────┴───────┬───────┴─────────────┘
                                  ▼
                   ┌──────────────────────────────┐
                   │    pkg/config & pkg/util     │
                   └──────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Domain Sentinel Errors | Define typed sentinel errors for config, llm, tools, agent, session, protocol, and engine packages | M1 | survey |
| 2 | Structured Error Types | Implement `ConfigError`, `LLMError`, `ToolError`, `AgentError`, `SessionError`, `ProtocolError`, `EngineError` with `errors.Is`/`errors.As`/`Unwrap` | M1 | survey |
| 3 | Safe Protocol Marshaling | Eliminate `panic(err)` from `MustMarshalPayload` and provide safe `MarshalPayload` with error returns | M1 | survey |
| 4 | Typed Retry Predicates | Replace fragile `strings.Contains` error matching in `pkg/llm/retry.go` with typed `LLMError.IsRetryable()` | M1 | survey |
| 5 | Config Layer Decoupling | Remove `pkg/llm` import from `pkg/config`, localizing model alias resolution cleanly | M2 | survey |
| 6 | Swappable Session Store Interface | Introduce `session.Store` interface with `DirStore` and `MemoryStore` implementations | M2 | survey |
| 7 | Engine Agent Decoupling | Implement `engine.AgentFactory` / `ChatRunner` to allow mocking agent runs in WebSocket engine tests | M2 | survey |
| 8 | TUI Global State Elimination | Replace `activeProgram` package-global atomic pointer in `pkg/tui` with explicit UI request handler/sink | M2 | survey |
| 9 | Thread-Safe WebSocket Connection | Fix race condition on `c.send` channel during client disconnects in `pkg/engine/conn.go` | M3 | survey |
| 10| Backpressure Control Envelope Safety | Ensure critical termination envelopes (`TypeDone`, `TypeError`) are never dropped in `pkg/engine/conn.go` | M3 | survey |
| 11| Uncapped Streaming Contexts | Remove artificial 120s `http.Client.Timeout` in `pkg/llm/client.go` to support long reasoning model streams | M3 | survey |
| 12| Subsystem Bug & Panic Fixes | Fix nil dereference in `grep.go`, index out of range in `engine/client.go:Ask`, nil message guard in `agent.go` | M3 | survey |
| 13| Unit & Package Test Suite Expansion | Add comprehensive tests for `pkg/util` (`atomic`, `truncate`), `pkg/tui`, `cmd/excelsior`, and untested paths | M4 | survey |
| 14| Static Analysis & Vet Cleanliness | Ensure 100% compliance with `go vet ./...` and standard static analysis with 0 diagnostics | M4 | survey |
| 15| Dual-Track Opaque-Box E2E Test Suite | Design and execute Tier 1-4 test suite covering CLI, Engine, Agent, Tools, and Streaming | M5 | survey |
| 16| Adversarial Coverage & Hardening | Execute Tier 5 white-box adversarial stress tests and final forensic audit validation | M6 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Unified Domain Error Hierarchy & Safe Protocol Serialization | Define sentinels, structured error types, eliminate panics, typed retry predicates | none | DONE |
| M2 | Core Architecture Decoupling & Interface Abstractions | Break reverse dependencies in config, introduce `session.Store` interface, `engine.AgentFactory`, decouple TUI global state | M1 | DONE |
| M3 | Subsystem Hardening, Concurrency & Resilience | Fix engine conn race condition, remove streaming timeout, fix tool/client panic bugs | M1, M2 | DONE |
| M4 | Production Test Suite & Static Analysis Excellence | Add unit tests for `pkg/util`, `pkg/tui`, `pkg/engine`, `cmd/excelsior`; expand coverage; `go vet` clean | M1, M2, M3 | DONE |
| M5 | Dual-Track Opaque-Box E2E Test Suite (Tiers 1-4) | End-to-end integration tests verifying requirements independently (test/challenge) | M1, M2, M3 | DONE |
| M6 | Final Adversarial Hardening (Tier 5) & Victory Audit | Adversarial stress tests, full vet/build verification, forensic audit | M4, M5 | DONE |


## Interface Contracts
### `session.Store`
```go
type Store interface {
    Save(rec Record) error
    Load(id string) (Record, error)
    List() ([]SessionMeta, error)
    Delete(id string) error
    Latest() (Record, error)
}
```

### `agent.LLM` & `agent.ToolRegistry`
```go
type LLM interface {
    StreamChat(ctx context.Context, req llm.ChatRequest, onDelta func(llm.Delta) error) (*llm.Message, error)
    ModelName() string
}

type ToolRegistry interface {
    Get(name string) (tools.Tool, bool)
    All() []tools.Tool
}
```

### `engine.AgentFactory`
```go
type AgentFactory interface {
    NewAgent(model string, ws string) (agent.Runner, error)
}
```

### Domain Error Contracts
```go
// Standard domain error interface supporting errors.Is, errors.As, and Unwrap
type DomainError interface {
    error
    Unwrap() error
    Is(target error) bool
}
```

## Code Layout
- `cmd/excelsior/`: CLI entrypoints, root cobra commands, subcommands (`serve`, `tui`, `version`, `history`).
- `pkg/config/`: Configuration loading, workspace resolution, environment bindings, `ConfigError` & sentinels.
- `pkg/llm/`: LLM provider client, SSE streaming parser, retry policies, `LLMError` & sentinels.
- `pkg/tools/`: Tool definitions, tool registry, execution wrappers, `ToolError` & sentinels (`bash`, `view`, `write`, `edit`, `glob`, `grep`, `ls`, `ask`).
- `pkg/session/`: Session persistence, `Store` interface, `DirStore`, `MemoryStore`, `SessionError` & sentinels.
- `pkg/agent/`: ReAct agent loop, prompt generation, tool orchestration, `AgentError` & sentinels.
- `pkg/protocol/`: WebSocket wire protocol, envelope serialization, `ProtocolError` & sentinels.
- `pkg/engine/`: WebSocket server, client hub, connection lifecycle, `EngineError` & sentinels.
- `pkg/tui/`: Bubble Tea interactive terminal UI components, viewports, input handling.
- `pkg/util/`: Atomic file operations, string truncations, helper utilities.
- `test/e2e/`: Requirement-driven opaque-box E2E test suites (Tiers 1-4).
