# Handoff Report — Explorer 1 (survey_explorer_1)

**Task**: Architectural & Structural Survey of the Excelsior Go Codebase (Focus on R1: Decoupled & Modular Architecture)  
**Date**: 2026-08-29  
**Agent ID / Conversation**: `survey_explorer_1` (Parent: `8884cc3c-d4d3-4cb8-91b1-a31965788d96`)  
**Report Artifact**: `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\survey_explorer_1\survey_report.md`

---

## 1. Observation

Direct inspection of all Go packages in `c:\Users\huynh\OneDrive\Desktop\projects\excelsior` revealed the following exact facts:

1. **`pkg/config` Imports `pkg/llm` (Reverse Layer Coupling)**:
   - `pkg/config/config.go:11`:
     ```go
     import (
         ...
         "excelsior/pkg/llm"
     )
     ```
   - `pkg/config/config.go:34`:
     ```go
     func ResolveModel(m string) string { return llm.ResolveModel(m) }
     ```
   - `pkg/config/config.go:49`:
     ```go
     Model: ResolveModel(envOr("DEEPSEEK_MODEL", DefaultModel)),
     ```

2. **Domain Message Representation Coupling (`llm.Message`)**:
   - `pkg/protocol/protocol.go:6-7`:
     ```go
     import (
         "encoding/json"
         "excelsior/pkg/llm"
     )
     ```
   - `pkg/session/session.go:16`:
     ```go
     import (
         ...
         "excelsior/pkg/llm"
         "excelsior/pkg/util"
     )
     ```
   - `pkg/engine/handlers.go:9-10`:
     ```go
     import (
         ...
         "excelsior/pkg/llm"
         "excelsior/pkg/protocol"
         "excelsior/pkg/util"
     )
     ```
   - `protocol.ChatReq` and `session.Record` directly embed `[]llm.Message`.

3. **Concrete Instantiations inside Engine Handlers**:
   - `pkg/engine/chat_handler.go:23-29`:
     ```go
     client := c.llmClient(req.Model)
     ag := &agent.Agent{
         LLM:    client,
         Tools:  tools.DefaultRegistry(c.currentWorkspace()),
         System: agent.DefaultSystemPrompt,
         Logger: c.hub.logger(),
     }
     ```
   - Every incoming WebSocket `chat.req` constructs concrete `llm.Client`, `tools.DefaultRegistry`, and `agent.Agent`.

4. **Package-Global State in `pkg/tui`**:
   - `pkg/tui/run.go:12`:
     ```go
     var activeProgram atomic.Pointer[tea.Program]
     ```
   - `pkg/tui/start.go:29-33`:
     ```go
     prog := activeProgram.Load()
     if prog == nil {
         return tools.AskResponse{}, fmt.Errorf("no active TUI")
     }
     prog.Send(askRequestMsg{Req: req, RespChan: respCh})
     ```

5. **Panics in Protocol Marshaling**:
   - `pkg/protocol/protocol.go:34-36`:
     ```go
     b, err := json.Marshal(v)
     if err != nil {
         panic(err)
     }
     ```

6. **Absence of Session Store & Engine Runner Interfaces**:
   - `pkg/session/session.go:22`: `type Store struct { Dir string }` is a concrete struct.
   - There is no `session.Store` or `session.Repository` interface for in-memory or alternative storage backends.

7. **Clean Existing Consumer Interfaces in `pkg/agent`**:
   - `pkg/agent/agent.go:16-25`:
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

---

## 2. Logic Chain

1. From **Observation 1**, `pkg/config` (a base configuration package) imports `pkg/llm` (a higher-level transport package). In idiomatic Go architecture, base packages should not depend on client/transport packages. This violates the principle of unidirectional dependency flow and risks cyclic dependencies if `pkg/llm` needs configuration types.
2. From **Observation 2**, `pkg/protocol` and `pkg/session` import `pkg/llm` to use `llm.Message`. Consequently, both storage and network protocol layers are tightly bound to the provider-specific wire representation of LLM completions.
3. From **Observation 3**, `pkg/engine` cannot be tested with simulated agent turns without initiating real network/filesystem calls because `handleChat` directly creates concrete `agent.Agent` and `llm.Client` instances instead of delegating to an injected `AgentFactory` or `Runner`.
4. From **Observation 4**, `activeProgram` in `pkg/tui` creates a package-global singleton. If multiple TUI instances run (e.g. concurrent tests), race conditions or message misrouting occur.
5. From **Observation 5**, calling `MustMarshalPayload` with non-serializable objects causes unexpected runtime crashes via `panic` rather than returning standard Go errors.
6. From **Observation 6**, the lack of an interface for session persistence forces all consumers (`cmd`, `engine`) to use directory-based disk IO rather than swappable in-memory stores for unit testing.
7. From **Observation 7**, the agent loop already uses ports-and-adapters for `LLM` and `ToolRegistry`, providing a proven blueprint for extending interface segregation across the remaining packages.

---

## 3. Caveats

- **Frontend & Desktop apps (`apps/electron`, `apps/web`)**: The survey focused strictly on the Go codebase in `cmd/`, `pkg/`, and root. The JavaScript/TypeScript frontends interact via WebSocket protocol `v1` and were not deeply audited, but any change to `pkg/protocol` JSON serialization must maintain wire compatibility with these clients.
- **Go toolchain execution**: Static analysis tools (`golangci-lint`, `go test -race`) were verified against existing configs (`.golangci.yml`, `Makefile`).
- **No other caveats.**

---

## 4. Conclusion

The Excelsior Go codebase has clean core fundamentals and well-structured packages. To achieve full compliance with **R1 (Decoupled & Modular Architecture)**, the refactoring targets are:
1. **Break reverse coupling in `pkg/config`**: Relocate model alias normalization so `config` does not import `llm`.
2. **Define `session.Store` interface**: Enable swappable persistence (filesystem vs. in-memory test store).
3. **Introduce `engine.AgentFactory` / `ChatRunner`**: Decouple WebSocket connection handlers from concrete agent creation.
4. **Decouple TUI interactive questions**: Remove package-global `activeProgram` by passing explicit UI sinks/channels.
5. **Eliminate panics in `pkg/protocol`**: Provide safe error-returning marshaling methods.
6. **Define `llm.Provider` interface**: Formalize transport swappability in `pkg/llm`.

---

## 5. Verification Method

To independently verify these observations:
1. **Inspect reverse dependency**:
   `grep -n "excelsior/pkg/llm" pkg/config/config.go` $\rightarrow$ confirms line 11 import.
2. **Inspect global variable in TUI**:
   `grep -n "activeProgram" pkg/tui/run.go pkg/tui/start.go` $\rightarrow$ confirms atomic pointer usage.
3. **Inspect engine concrete coupling**:
   `grep -n "agent.Agent{" pkg/engine/chat_handler.go` $\rightarrow$ confirms line 24 instantiation.
4. **Run existing project tests**:
   Execute `go test ./...` and `go vet ./...` in the root workspace.
