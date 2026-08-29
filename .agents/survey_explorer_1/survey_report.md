# Architectural and Structural Survey Report: Excelsior Codebase

**Date**: 2026-08-29  
**Target Codebase**: `c:\Users\huynh\OneDrive\Desktop\projects\excelsior`  
**Author**: Explorer 1 (`survey_explorer_1`)  
**Objective**: Comprehensive architectural and structural mapping of the Excelsior Go codebase to establish the baseline and concrete refactoring targets for **R1 (Decoupled & Modular Architecture)**.

---

## 1. Executive Summary

Excelsior is a Go-based coding agent system tailored for DeepSeek models (supporting both fast tool-calling models like `deepseek-v4-flash` / `deepseek-chat` and reasoning models like `deepseek-reasoner` / `deepseek-v4-pro` with `reasoning_content` streaming). The repository encompasses:
1. **Core library packages** (`pkg/config`, `pkg/llm`, `pkg/tools`, `pkg/agent`, `pkg/protocol`, `pkg/session`, `pkg/engine`, `pkg/tui`, `pkg/util`).
2. **CLI & Daemons** (`cmd/excelsior` providing root CLI execution, interactive TUI mode, and a WebSocket engine daemon).
3. **Electron & Web desktop/frontend wrappers** (`apps/electron`, `apps/web`).

While the codebase already demonstrates commendable foundation patterns (such as consumer-defined interfaces in `pkg/agent`, jailing in `pkg/tools`, and atomic disk writes in `pkg/util`), several architectural couplings, missing abstraction boundaries, and design opportunities exist that prevent the system from achieving gold-standard modularity under requirement R1.

---

## 2. Comprehensive Codebase Inventory & Symbol Map

### 2.1 Package Overview

| Package | Purpose | Core Files | Direct Internal Dependencies |
| :--- | :--- | :--- | :--- |
| `cmd/excelsior` | Application entry points, Cobra CLI commands (`run`, `tui`, `engine`, `models`, `version`) | `main.go`, `engine.go`, `tui.go` | `pkg/config`, `pkg/agent`, `pkg/llm`, `pkg/session`, `pkg/tools`, `pkg/engine`, `pkg/tui`, `pkg/util` |
| `pkg/config` | Environment and CLI flag configuration, workspace resolution | `config.go`, `doc.go`, `config_test.go` | `pkg/llm` *(coupling via `llm.ResolveModel`)* |
| `pkg/llm` | DeepSeek-native HTTP/SSE client, model alias resolution, exponential retries, typed HTTP errors | `types.go`, `client.go`, `retry.go`, `sse.go`, `doc.go`, `llm_test.go`, `deepseek_test.go` | `pkg/util` |
| `pkg/tools` | Workspace-jailed tool execution (view, ls, glob, grep, write, edit, bash, askQuestion), registry | `tools.go`, `secure.go`, `ask.go`, `bash.go`, `edit.go`, `glob.go`, `grep.go`, `ls.go`, `view.go`, `write.go`, `doc.go`, `tools_test.go` | `pkg/util` |
| `pkg/agent` | Agentic tool-call loop, streaming event aggregator, context-bounded execution | `agent.go`, `doc.go`, `agent_test.go`, `mock_llm_test.go` | `pkg/llm`, `pkg/tools` |
| `pkg/protocol` | Versioned (`v1`) JSON WebSocket message envelope and wire payload structs | `protocol.go`, `doc.go`, `protocol_test.go` | `pkg/llm` |
| `pkg/session` | Atomic disk-backed conversation persistence (`.excelsior/sessions/<id>.jsonl`) | `session.go`, `doc.go`, `session_test.go` | `pkg/llm`, `pkg/util` |
| `pkg/engine` | Multi-client WebSocket hub daemon, per-connection chat execution, interactive ask forwarding | `hub.go`, `conn.go`, `client.go`, `chat_handler.go`, `handlers.go`, `doc.go`, `engine_test.go` | `pkg/agent`, `pkg/config`, `pkg/llm`, `pkg/protocol`, `pkg/session`, `pkg/tools`, `pkg/util` |
| `pkg/tui` | Terminal User Interface (Charmbracelet Bubble Tea / Lipgloss), streaming markdown transcript | `model.go`, `run.go`, `start.go`, `styles.go`, `update.go`, `view.go`, `ask.go`, `doc.go` | `pkg/agent`, `pkg/engine`, `pkg/llm`, `pkg/protocol`, `pkg/tools`, `pkg/util` |
| `pkg/util` | Shared atomic file writer (`WriteAtomic`), rune-safe truncation (`Truncate`) | `atomic.go`, `truncate.go`, `doc.go` | *(None - leaf package)* |

---

### 2.2 Detailed Type & Symbol Map by Package

#### `pkg/config`
- **Structs**:
  - `Config`: Fields `APIKey`, `BaseURL`, `Model`, `MaxTokens`, `Temperature`, `Workspace`, `EngineURL`.
- **Functions**:
  - `FromEnv() Config`: Reads configuration from environment with defaults.
  - `(Config) Validate() error`: Validates mandatory keys and values.
  - `ResolveModel(m string) string`: Forwards to `llm.ResolveModel`.
  - `ResolveWorkspace(flagWS, cfgWS string) (string, error)`: Validates and returns absolute workspace directory.

#### `pkg/llm`
- **Structs & Types**:
  - `Message`: Chat message with `Role`, `Content`, `ReasoningContent`, `ToolCalls`, `ToolCallID`, `Name`.
  - `ToolCall`, `FuncCall`: Function calling wire shapes.
  - `ToolDefinition`, `FuncDef`: Tool schema registration objects.
  - `ChatRequest`: Payload sent to `/v1/chat/completions`.
  - `Delta`, `ToolCallDelta`, `Usage`: Incremental SSE streaming fragments.
  - `Client`: Concrete HTTP client with `APIKey`, `BaseURL`, `Model`, `HTTPClient`, `Logger`.
  - `RetryPolicy`: Backoff configuration (`MaxRetries`, `BaseDelay`).
  - `LLMError`: Error holding `StatusCode`, `Body`, `Err`.
- **Functions**:
  - `NewClient(apiKey, model string) *Client`
  - `(Client) ModelName() string`
  - `(Client) StreamChat(ctx context.Context, req ChatRequest, onDelta func(Delta) error) (*Message, error)`
  - `(Client) Chat(ctx context.Context, req ChatRequest) (*Message, error)`
  - `ResolveModel(m string) string`, `IsReasoner(model string) bool`
  - `parseSSEStream(ctx context.Context, r io.Reader, logger *slog.Logger, onDelta func(Delta) error) (*Message, error)`

#### `pkg/tools`
- **Interfaces**:
  - `Tool`:
    ```go
    type Tool interface {
        Name() string
        Description() string
        Parameters() any
        Execute(ctx context.Context, args json.RawMessage) (string, error)
    }
    ```
- **Structs**:
  - `Registry`: In-memory container of tools (`map[string]Tool`).
  - `ViewTool`, `LsTool`, `GlobTool`, `GrepTool`, `WriteTool`, `EditTool`, `BashTool`, `AskTool`: Concrete tool implementations.
  - `AskRequest`, `AskResponse`: Interactivity data transfer objects.
- **Function Types & Context**:
  - `QuestionHandler`: `func(ctx context.Context, req AskRequest) (AskResponse, error)`
  - `WithQuestionHandler(ctx, h)`, `GetQuestionHandler(ctx)`
- **Functions**:
  - `NewRegistry(ts ...Tool) *Registry`
  - `DefaultRegistry(workspace string) *Registry`
  - `(Registry) Get(name string) (Tool, bool)`
  - `(Registry) All() []Tool`
  - `secureJoin(root, p string) (string, error)`

#### `pkg/agent`
- **Interfaces (Consumer-Defined Ports)**:
  - `LLM`:
    ```go
    type LLM interface {
        StreamChat(ctx context.Context, req llm.ChatRequest, onDelta func(llm.Delta) error) (*llm.Message, error)
        ModelName() string
    }
    ```
  - `ToolRegistry`:
    ```go
    type ToolRegistry interface {
        Get(name string) (tools.Tool, bool)
        All() []tools.Tool
    }
    ```
- **Structs**:
  - `Agent`: Core orchestrator owning `LLM`, `Tools`, `System`, `MaxIters`, `Model`, `Logger`.
  - `StreamEvent`: Unified streaming event (`Type`, `Text`, `Reasoning`, `ToolName`, `ToolCallID`, `ToolArgs`, `ToolResult`, `FinishReason`).
  - `RunOptions`: `Messages`, `OnEvent func(StreamEvent)`.
  - `RunResult`: `FinalMessage`, `Messages`.
- **Functions**:
  - `(Agent) Run(ctx, opts) (*llm.Message, error)`
  - `(Agent) RunWithHistory(ctx, opts) (*RunResult, error)`
  - `(Agent) execTools(...)`, `(Agent) callTool(...)`

#### `pkg/protocol`
- **Structs**:
  - `Envelope`: Wire frame with `Ver`, `ID`, `Type`, `Payload json.RawMessage`.
  - Message Payloads: `ChatReq`, `Delta`, `AskReq`, `AskResp`, `SessionListReq`, `SessionListResp`, `SessionInfo`, `SessionCreateReq`, `SessionCreateResp`, `SessionDeleteReq`, `SessionDataReq`, `SessionDataResp`, `SessionRenameReq`, `WorkspaceSetReq`.
- **Functions**:
  - `(Envelope) Decode(v any) error`
  - `MustMarshalPayload(v any) json.RawMessage`
  - `NewEnvelope(...)`, `NewEnvelopeWithID(...)`

#### `pkg/session`
- **Structs**:
  - `Store`: Filesystem store rooted at `Dir` (`.excelsior/sessions`).
  - `Record`: On-disk representation (`ID`, `Title`, `CreatedAt`, `Messages []llm.Message`).
- **Functions**:
  - `NewStore(dir string) *Store`
  - `(Store) Save(ctx, id, messages) error`, `(Store) SaveWithTitle(ctx, id, title, messages) error`
  - `(Store) Load(ctx, id) ([]llm.Message, error)`, `(Store) LoadRecord(ctx, id) (*Record, error)`
  - `(Store) Rename(ctx, id, title) error`, `(Store) Delete(ctx, id) error`, `(Store) List(ctx) ([]string, error)`, `(Store) Prune(ctx, maxAge) (int, error)`

#### `pkg/engine`
- **Structs**:
  - `Hub`: Central daemon (`Addr`, `Config`, `clients map[*Conn]struct{}`, `ws atomic.Pointer[string]`).
  - `Conn`: Per-client connection managing WebSocket read/write pumps, session storage, and `handleChat`.
  - `WSClient`: Client connection helper for streaming remote chat.
- **Functions**:
  - `NewHub(cfg, workspace) *Hub`, `(Hub) ListenAndServe(ctx)`, `(Hub) Handler()`, `(Hub) Broadcast(env)`
  - `(WSClient) StreamRemote(ctx, req, onDelta, askHandler) error`

#### `pkg/tui`
- **Structs**:
  - `Config`: `Agent *agent.Agent`, `Workspace`, `Model`, `History`, `EngineURL`.
  - `model`: Bubble Tea model containing viewport, text input, stream builders, and transcript blocks.
  - `askOverlay`: Interactive clarification question overlay.
- **Functions**:
  - `New(cfg Config) tea.Model`, `Run(cfg Config) error`

#### `pkg/util`
- **Functions**:
  - `WriteAtomic(path string, data []byte, perm os.FileMode) error`
  - `Truncate(s string, n int) string`

---

## 3. Dependency & Coupling Analysis

```
                              ┌───────────────┐
                              │ cmd/excelsior │
                              └───┬───────┬───┘
                                  │       │
              ┌───────────────────┼───────┴───────────────────────┐
              ▼                   ▼                               ▼
       ┌──────────────┐    ┌──────────────┐                ┌──────────────┐
       │   pkg/tui    │───►│  pkg/engine  │───────────────►│  pkg/agent   │
       └──────┬───────┘    └──────┬───────┘                └──────┬───────┘
              │                   │                               │
              │                   ├───────────────┐               │
              │                   ▼               ▼               │
              │            ┌──────────────┐┌──────────────┐       │
              │            │ pkg/protocol ││ pkg/session  │       │
              │            └──────┬───────┘└──────┬───────┘       │
              │                   │               │               │
              │                   └───────┬───────┘               │
              ▼                           ▼                       ▼
       ┌──────────────┐            ┌──────────────┐        ┌──────────────┐
       │  pkg/config  │───────────►│   pkg/llm    │◄───────│  pkg/tools   │
       └──────────────┘            └──────┬───────┘        └──────┬───────┘
                                          │                       │
                                          └───────────┬───────────┘
                                                      ▼
                                               ┌──────────────┐
                                               │   pkg/util   │
                                               └──────────────┘
```

### 3.1 Key Architectural Coupling Observations

1. **`pkg/config` depends on `pkg/llm` (Reverse Layer Coupling)**:
   - **Observation**: `pkg/config/config.go:11` imports `excelsior/pkg/llm` in order to call `llm.ResolveModel(envOr("DEEPSEEK_MODEL", DefaultModel))` in `FromEnv()`.
   - **Impact**: Configuration should be a base leaf package. Having configuration depend on transport-level packages prevents using configuration in low-level layers without risking circular dependencies.
   - **Remedy**: Model constants, aliases, and normalization logic should either reside in `pkg/config` or in a dedicated domain/model layer, with `pkg/llm` referencing config/domain models rather than vice versa.

2. **Domain Representation Leaks via `pkg/llm.Message`**:
   - **Observation**: `pkg/protocol` (`protocol.go:6`), `pkg/session` (`session.go:16`), and `pkg/engine` (`handlers.go:9`) all import `pkg/llm` specifically to use `llm.Message`.
   - **Impact**: Storage records, WebSocket protocol definitions, and conversation histories are directly married to the wire format of the DeepSeek/OpenAI chat completion API. If an alternative provider (or internal multi-modal format) is used, all session stores and protocol buffers are bound to `llm.Message`.
   - **Remedy**: Decouple message representation or define clear domain message types, ensuring `llm.Message` represents provider-specific serialization while session/protocol/agent maintain clean domain models.

3. **Concrete Instantiations inside Engine Handlers**:
   - **Observation**: `pkg/engine/chat_handler.go:23-29` directly constructs concrete instances of `llm.Client`, `tools.DefaultRegistry`, and `agent.Agent` inside `handleChat` on every incoming chat message.
   - **Impact**: Engine is tightly coupled to concrete implementations. Testing the engine's chat execution without real LLM network calls or filesystem tools requires monkey-patching or complex test harnesses.
   - **Remedy**: Introduce an `AgentFactory` or `AgentRunner` interface into `Hub` and `Conn`, enabling seamless injection of mock or customized agents in engine tests.

4. **Global Mutable State in `pkg/tui`**:
   - **Observation**: `pkg/tui/run.go:12` uses package-level `var activeProgram atomic.Pointer[tea.Program]` so that `tuiAskHandler` (`start.go:29`) can locate the Bubble Tea program to send messages.
   - **Impact**: Creates hidden coupling between the background agent goroutine and the global state of `pkg/tui`. Prevents running multiple concurrent TUI instances (e.g. in test suites).
   - **Remedy**: Pass a message dispatcher channel or UI event sink explicitly via `tui.Config` and context rather than accessing a package-global variable.

5. **`MustMarshalPayload` Panic Risk**:
   - **Observation**: `pkg/protocol/protocol.go:35` uses `panic(err)` in `MustMarshalPayload`.
   - **Impact**: If non-serializable structures (such as channels or circular references) are passed to protocol envelopes, the engine or CLI process will immediately crash rather than returning a recoverable error.
   - **Remedy**: Replace panics with explicit error returns or safe serialization fallbacks.

---

## 4. Interface & Abstraction Assessment

### 4.1 Interface Segregation & Go Idiomaticity Review

| Subsystem | Existing Abstraction | Go Best Practice Assessment | Grade |
| :--- | :--- | :--- | :--- |
| **Agent $\leftrightarrow$ LLM** | `agent.LLM` defined in `pkg/agent/agent.go:16` (`StreamChat`, `ModelName`) | **Strong**: Consumer-defined interface with minimal surface. However, `pkg/llm` does not define an exported `Provider` or `Transport` interface for swappable middleware (logging, metrics, retries). | **B+** |
| **Agent $\leftrightarrow$ Tools** | `agent.ToolRegistry` defined in `pkg/agent/agent.go:22` (`Get`, `All`) | **Strong**: Clean consumer port. Allows custom test registries and mock tools. | **A-** |
| **Tools Interface** | `tools.Tool` defined in `pkg/tools/tools.go:23` (`Name`, `Description`, `Parameters`, `Execute`) | **Good**: Standard tool contract. `Parameters() any` could be typed or documented as JSON Schema map. | **A-** |
| **Session Persistence** | Concrete struct `*session.Store` in `pkg/session/session.go:22` | **Weak**: No `Store` or `SessionService` interface. Engine and CLI depend directly on concrete disk-backed store, preventing in-memory store injection for tests. | **C** |
| **Engine Execution** | Hardcoded `agent.Agent` creation in `chat_handler.go` | **Weak**: Engine cannot swap execution engines or agent loops. | **C+** |
| **TUI Execution** | `tui.Config` holds concrete `*agent.Agent` pointer | **Fair**: Supports `EngineURL` and `*agent.Agent`, but dual branching logic is hardcoded inside `startAgent()`. | **B-** |

---

## 5. Core Architectural Components & Refactoring Targets for R1

To achieve a decoupled, testable, and modular architecture compliant with **R1 (Decoupled & Modular Architecture)**, the following refactoring roadmap is established:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          TARGET ARCHITECTURE                           │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Core Domain & Config:                                              │
│    - Remove `pkg/config -> pkg/llm` dependency.                        │
│    - Establish clean model identification & workspace validation.     │
│                                                                        │
│ 2. LLM Transport Layer:                                                │
│    - Define `llm.Provider` / `llm.Streamer` interface.                 │
│    - Implement pluggable HTTP transport & configurable retry policies. │
│                                                                        │
│ 3. Tool Registry & Execution Layer:                                    │
│    - Keep `tools.Tool` interface crisp and secure.                    │
│    - Enhance `tools.Registry` with thread-safety and dynamic tools.   │
│                                                                        │
│ 4. Session & Storage Layer:                                            │
│    - Define `session.Store` interface (Save, Load, List, Delete, etc.).│
│    - Provide `FileStore` (production) and `MemoryStore` (tests).      │
│                                                                        │
│ 5. Agent Loop Subsystem:                                               │
│    - Strictly preserve consumer-defined ports (`LLM`, `ToolRegistry`). │
│    - Decouple question handling into clean injectable handlers.        │
│                                                                        │
│ 6. Engine & TUI Subsystems:                                            │
│    - Inject `AgentFactory` / `Runner` into `pkg/engine`.               │
│    - Remove global `activeProgram` in `pkg/tui`, using injected sinks.│
│                                                                        │
│ 7. Composition Root:                                                   │
│    - `cmd/excelsior` composes dependencies cleanly at startup.         │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Component Refactoring Matrix

| Target Component | Current State | Required Refactoring for R1 |
| :--- | :--- | :--- |
| **`pkg/config`** | Imports `pkg/llm` for model resolution | Decouple model aliases into config or model registry; eliminate reverse dependency. |
| **`pkg/llm`** | Concrete struct `Client` only | Define `Provider` interface; separate request building, transport, and SSE parsing for swappability. |
| **`pkg/tools`** | Concrete `Registry` map, context-based question handler | Ensure thread-safe registry operations; formalize interactive prompt interface. |
| **`pkg/session`** | Concrete `Store` struct | Introduce `Store` interface; support pluggable storage backends (filesystem, memory). |
| **`pkg/engine`** | Direct agent instantiation in `chat_handler.go` | Introduce `AgentFactory` or `ChatRunner` interface for testability and swappable agents. |
| **`pkg/tui`** | Global `activeProgram` pointer, concrete `Agent` in config | Eliminate global pointer via explicit event dispatching; accept generic agent runner interface. |
| **`pkg/protocol`** | Panics on marshal errors | Eliminate panics; return typed errors or safe fallbacks. |

---

## 6. Synergies with Requirements R2 (Errors) & R3 (Quality)

- **Synergy with R2 (Domain Error Hierarchy)**:
  - Establishing decoupled interfaces in R1 directly enables introducing typed domain errors (e.g. `llm.ErrRateLimit`, `tools.ErrPathOutsideWorkspace`, `session.ErrNotFound`) without circular dependencies between packages.
- **Synergy with R3 (Quality & Testability)**:
  - Introducing `session.Store` interface and `engine.AgentFactory` allows high-speed in-memory unit testing and eliminates concurrency races caused by global pointers (`activeProgram`).

---

## 7. Conclusion

The Excelsior codebase has an exceptionally strong core design with clean separation of concerns. With targeted refactorings to break reverse dependencies (`config -> llm`), formalize storage/engine interfaces, eliminate package-global state in TUI, and establish swappable LLM transport abstractions, Excelsior will achieve masterclass modularity adhering to SOLID principles and idiomatic Go architecture.
