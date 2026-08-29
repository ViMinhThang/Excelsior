# Comprehensive Concurrency, Quality, and Testing Survey Report

**Author**: Explorer 3 (`survey_explorer_3`)  
**Timestamp**: 2026-08-29T13:13:20Z  
**Repository**: `c:\Users\huynh\OneDrive\Desktop\projects\excelsior`  
**Target Milestone**: R3 (Production Clean Code & Quality Standards) & Baseline Survey

---

## Executive Summary

An exhaustive survey of the Excelsior Go codebase was performed covering concurrency safety, context propagation, resource lifecycles, static analysis, and test coverage across all 10 Go packages (`pkg/agent`, `pkg/config`, `pkg/engine`, `pkg/llm`, `pkg/protocol`, `pkg/session`, `pkg/tools`, `pkg/tui`, `pkg/util`, `cmd/excelsior`).

### Key Findings
1. **Build & Vet Status**: `go build ./...` and `go vet ./...` pass cleanly with zero compiler or vet warnings.
2. **Test Suite Status**: `go test ./...` passes all existing test suites. However, 3 packages (`pkg/tui`, `pkg/util`, `cmd/excelsior`) have **0.0% coverage** with no test files. Overall statement coverage across the repository is ~55%.
3. **Race Condition Hazard in WebSocket Send**: In `pkg/engine/conn.go:sendEnvelope`, `c.closed` is checked under `RLock` and immediately unlocked before `c.send <- b`. If `c.close()` runs concurrently on disconnect, a panic on `send on closed channel` can occur.
4. **Envelope Dropping Risk**: `c.send` in `pkg/engine/conn.go` drops envelopes when the 128-element buffer is full. Dropping terminal `TypeDone` or `TypeError` messages causes connected TUI/web clients to hang indefinitely.
5. **HTTP Streaming Timeout Issue**: `defaultHTTPClient` in `pkg/llm/client.go` specifies `Timeout: 120 * time.Second`. In `net/http`, `Client.Timeout` bounds the entire response body read duration. Long-running reasoning streams (e.g. `deepseek-reasoner` with large chains of thought) will be killed prematurely at 120s regardless of active streaming.
6. **Panic in Protocol**: `pkg/protocol/protocol.go:35` contains `panic(err)` inside `MustMarshalPayload`, violating R2/R3 production clean code guidelines.

---

## 1. Context Propagation & Timeout/Cancellation Analysis

| Subsystem / File | Context Ingestion | Cancellation / Timeout Checks | Status & Findings |
|---|---|---|---|
| **Agent Loop** (`pkg/agent/agent.go`) | `RunWithHistory(ctx, ...)` | `ctx.Err()` checked before every iteration, before every tool execution, and inside `onDelta` callback | **Exemplary**. Cancellation instantly halts LLM requests and tool execution without orphaned turns. |
| **LLM Transport** (`pkg/llm/client.go`, `sse.go`) | `StreamChat(ctx, ...)` -> `http.NewRequestWithContext(ctx, ...)` | Checked in retry sleep (`select <-ctx.Done()`), checked in SSE stream reader loop (`select <-ctx.Done()`) | **Good**. However, `defaultHTTPClient.Timeout = 120s` risks aborting lengthy streams. `isRetryable` marks `context.DeadlineExceeded` as retryable even if caller context expired. |
| **Process Execution** (`pkg/tools/bash.go`) | `Execute(ctx, ...)` -> `runShell(ctx, ...)` | `context.WithTimeout(ctx, timeout)` (1s..120s, default 30s) -> `exec.CommandContext(ctx, ...)` | **Good**. Detects `context.DeadlineExceeded` and appends `[timeout]` note. Subprocess tree killing could be improved via process groups / `cmd.Cancel`. |
| **File / Search Tools** (`pkg/tools/*.go`) | `Execute(ctx, ...)` | Checked at entry for all tools; `walkGlob` and `grepWalk` check `ctx.Err()` during recursive directory walks and line matching | **Exemplary**. Long-running search across large repos respects cancellation immediately. |
| **Session Persistence** (`pkg/session/session.go`) | `Save`, `LoadRecord`, `List`, `Prune` take `ctx` | `checkCtx(ctx)` at entry; `Prune` checks `ctx.Err()` in file deletion loop | **Good**. |
| **Engine Server Hub** (`pkg/engine/hub.go`) | `ListenAndServe(ctx)` | Goroutine listens on `<-ctx.Done()` and executes graceful `srv.Shutdown(shCtx)` with 5s timeout | **Good**. |
| **WebSocket Connection** (`pkg/engine/conn.go`, `chat_handler.go`) | `readPump(ctx)` passes request context `r.Context()` | `handleChat` runs under `r.Context()`; `askHandler` waits on both handler context and parent context | **Good**. Connection termination cancels active agent runs. |
| **Remote WS Client** (`pkg/engine/client.go`) | `StreamRemote(ctx, ...)` | Checked before loop; but `ws.ReadMessage()` is blocking on 60s read deadline | **Gap**: Cancellation while blocked in `ws.ReadMessage()` does not unblock until 60s deadline or transport error. |
| **TUI Stream Loop** (`pkg/tui/start.go`) | `startAgent` creates `WithCancel(context.TODO())` | User pressing `Esc` / `Ctrl+C` calls `m.cancel()`; channel receives send with `select case <-ctx.Done()` | **Good**. Cancellation cleans up worker goroutine and restores input prompt. Should use `context.Background()` instead of `context.TODO()`. |

---

## 2. Concurrency, Goroutine Lifecycles & Resource Safety

### Detailed Analysis by Component

#### 1. WebSocket Connection Channel Race (`pkg/engine/conn.go`)
- **Location**: `Conn.sendEnvelope` (`pkg/engine/conn.go:64-80`) & `Conn.close` (`pkg/engine/conn.go:86-96`).
- **Code Pattern**:
  ```go
  func (c *Conn) sendEnvelope(env protocol.Envelope) {
      c.mu.RLock()
      closed := c.closed
      c.mu.RUnlock()
      if closed {
          return
      }
      // ...
      select {
      case c.send <- b:
      default:
          c.hub.logger().Warn("ws send buffer full, dropping envelope", "type", env.Type)
      }
  }
  ```
- **Vulnerability**: If `sendEnvelope` evaluates `closed == false`, releases `RUnlock()`, and then `c.close()` runs on connection tear-down (closing `c.send`), the subsequent `c.send <- b` will panic with `send on closed channel`.
- **Target Fix**: Hold `c.mu.RLock()` throughout the channel send, ensuring `close(c.send)` cannot execute while a send is in progress.

#### 2. Message Dropping & Deadlock on Backpressure (`pkg/engine/conn.go`)
- **Location**: `Conn.sendEnvelope` default select case.
- **Impact**: If a client is slow and 128 deltas buffer up, new envelopes are dropped. If the dropped envelope is `protocol.TypeDone` or `protocol.TypeError`, the client has no way of knowing the turn finished and will hang in streaming mode.
- **Target Fix**: Prioritize control envelopes (`done`, `error`, `ask.req`) to never be dropped, or implement bounded queue buffering with client flow control.

#### 3. Goroutine Allocation in Engine Frame Dispatch (`pkg/engine/conn.go`)
- **Location**: `Conn.readPump` (`pkg/engine/conn.go:166-176`).
- **Observation**: Every `session.list`, `session.data`, `session.create`, `session.delete`, `session.rename`, `workspace.set` spawns an unbounded goroutine (`go c.handleSessionList(...)`).
- **Target Fix**: Use synchronous handling or a bounded worker pool for non-streaming RPCs.

#### 4. Mutex & State Safety in Hub & Conn
- `Hub.ws` uses `sync/atomic.Pointer[string]`, providing lock-free atomic workspace reads/writes (`Workspace()` / `SetWorkspace()`).
- `Hub.clients` map is protected by `Hub.mu` (`sync.RWMutex`).
- `Conn.chatting` is guarded by `Conn.chatMu` (`sync.Mutex`), preventing overlapping chat turns on a single connection.
- `MockLLM` in tests is protected by `sync.Mutex`.

#### 5. Resource Lifecycles (File Descriptors, Buffers, Memory Limits)
- **Response Bodies**: All `http.Response` instances invoke `defer resp.Body.Close()` immediately after checking `err == nil`.
- **SSE Stream Limiting**: `io.LimitReader(r, 10 << 20)` prevents runaway stream allocation.
- **Line Scanner Buffer**: `maxSSLine = 1 << 20` (1 MiB) prevents memory exhaustion from unbounded lines.
- **Atomic File Writes**: `util.WriteAtomic` cleans up temporary files on failure via `defer func() { tmp.Close(); if !success { os.Remove(name) } }()`.
- **Tools Limits**:
  - `MaxFileReadSize`: 5 MB cap on file reads.
  - `MaxWriteSize`: 10 MB cap on file writes.
  - `MaxGrepFileSize`: 2 MB cap per file scanned.
  - `MaxGrepResults`: 200 matches cap.
  - `MaxCommandLength`: 8 KB cap on shell commands.

---

## 3. Automated Test Suite & Static Analysis Results

### Verbatim Tool Outputs

#### `go build ./...`
```text
Exit code: 0
Stdout: (empty)
Stderr: (empty)
Result: SUCCESS
```

#### `go vet ./...`
```text
Exit code: 0
Stdout: (empty)
Stderr: (empty)
Result: SUCCESS
```

#### `go test -v ./...`
```text
=== RUN   TestAgent_SimpleTextTurn
--- PASS: TestAgent_SimpleTextTurn (0.00s)
=== RUN   TestAgent_ReasoningStreaming
--- PASS: TestAgent_ReasoningStreaming (0.00s)
=== RUN   TestAgent_ToolInvocationLoop
--- PASS: TestAgent_ToolInvocationLoop (0.00s)
=== RUN   TestAgent_MultipleSequentialToolCalls
--- PASS: TestAgent_MultipleSequentialToolCalls (0.00s)
=== RUN   TestAgent_ToolExecutionError
--- PASS: TestAgent_ToolExecutionError (0.00s)
=== RUN   TestAgent_UnknownToolHandling
--- PASS: TestAgent_UnknownToolHandling (0.00s)
=== RUN   TestAgent_MaxIterationsCap
--- PASS: TestAgent_MaxIterationsCap (0.00s)
=== RUN   TestAgent_ContextCancellationBeforeRun
--- PASS: TestAgent_ContextCancellationBeforeRun (0.00s)
=== RUN   TestAgent_SystemPromptInsertion
--- PASS: TestAgent_SystemPromptInsertion (0.00s)
=== RUN   TestAgent_ContextTooLargeGuard
--- PASS: TestAgent_ContextTooLargeGuard (0.00s)
=== RUN   TestAgent_ToolResultTruncation
--- PASS: TestAgent_ToolResultTruncation (0.00s)
=== RUN   TestAgent_ValidationErrors
--- PASS: TestAgent_ValidationErrors (0.00s)
PASS
ok  	excelsior/pkg/agent	1.875s

=== RUN   TestFromEnv_Defaults
--- PASS: TestFromEnv_Defaults (0.00s)
=== RUN   TestResolveModel
--- PASS: TestResolveModel (0.00s)
=== RUN   TestValidate
--- PASS: TestValidate (0.00s)
PASS
ok  	excelsior/pkg/config	1.791s

=== RUN   TestHub_WorkspaceConcurrency
--- PASS: TestHub_WorkspaceConcurrency (0.00s)
=== RUN   TestHub_HealthEndpoint
--- PASS: TestHub_HealthEndpoint (0.00s)
=== RUN   TestHub_WebSocketSessionLifecycle
--- PASS: TestHub_WebSocketSessionLifecycle (0.05s)
=== RUN   TestConn_AskCorrelation
--- PASS: TestConn_AskCorrelation (0.00s)
=== RUN   TestSessionInfo_Fallback
--- PASS: TestSessionInfo_Fallback (0.00s)
PASS
ok  	excelsior/pkg/engine	2.941s

=== RUN   TestStreamChat_Success
--- PASS: TestStreamChat_Success (0.00s)
=== RUN   TestStreamChat_Retry
--- PASS: TestStreamChat_Retry (0.20s)
=== RUN   TestClient_Validate
--- PASS: TestClient_Validate (0.00s)
=== RUN   TestResolveModel_Alias
--- PASS: TestResolveModel_Alias (0.00s)
=== RUN   TestChat_SingleCall
--- PASS: TestChat_SingleCall (0.00s)
=== RUN   TestStreamChat_ReasoningAndToolCalls
--- PASS: TestStreamChat_ReasoningAndToolCalls (0.00s)
=== RUN   TestRetryPolicy_IsRetryable
--- PASS: TestRetryPolicy_IsRetryable (0.00s)
=== RUN   TestRetryPolicy_Backoff
--- PASS: TestRetryPolicy_Backoff (0.00s)
=== RUN   TestSSE_LineTooLarge
--- PASS: TestSSE_LineTooLarge (0.63s)
PASS
ok  	excelsior/pkg/llm	3.730s

=== RUN   TestEnvelopeSerialization
--- PASS: TestEnvelopeSerialization (0.00s)
=== RUN   TestAllProtocolMessageTypesSerialization
--- PASS: TestAllProtocolMessageTypesSerialization (0.00s)
=== RUN   TestChatReqRoundTrip
--- PASS: TestChatReqRoundTrip (0.00s)
PASS
ok  	excelsior/pkg/protocol	1.715s

=== RUN   TestStore_SaveLoad
--- PASS: TestStore_SaveLoad (0.03s)
=== RUN   TestStore_TitlePersistenceAndRename
--- PASS: TestStore_TitlePersistenceAndRename (0.08s)
=== RUN   TestStore_BackwardCompatibilityWithoutTitle
--- PASS: TestStore_BackwardCompatibilityWithoutTitle (0.02s)
=== RUN   TestStore_SanitizeID
--- PASS: TestStore_SanitizeID (0.01s)
=== RUN   TestStore_CorruptionHandling
--- PASS: TestStore_CorruptionHandling (0.12s)
=== RUN   TestStore_ListAndDelete
--- PASS: TestStore_ListAndDelete (0.07s)
=== RUN   TestStore_Prune
--- PASS: TestStore_Prune (0.08s)
PASS
ok  	excelsior/pkg/session	2.115s

=== RUN   TestSecureJoin
--- PASS: TestSecureJoin (0.01s)
=== RUN   TestRegistry_AllAndGet
--- PASS: TestRegistry_AllAndGet (0.00s)
=== RUN   TestGlobTool
--- PASS: TestGlobTool (0.01s)
=== RUN   TestViewTool
--- PASS: TestViewTool (0.12s)
=== RUN   TestLsTool
--- PASS: TestLsTool (0.01s)
=== RUN   TestWriteAndEditTool
--- PASS: TestWriteAndEditTool (0.08s)
=== RUN   TestBashTool_Validation
--- PASS: TestBashTool_Validation (0.12s)
=== RUN   TestGrepTool
--- PASS: TestGrepTool (0.04s)
=== RUN   TestAskTool
--- PASS: TestAskTool (0.00s)
PASS
ok  	excelsior/pkg/tools	1.867s

?   	excelsior/pkg/tui	[no test files]
?   	excelsior/pkg/util	[no test files]
```

#### `go test -race ./...`
```text
Exit code: 1
Output: go: -race requires cgo; enable cgo by setting CGO_ENABLED=1
Note: Host is Windows without GCC/Clang in PATH. Dynamic race detector unavailable locally without MinGW.
```

#### `go test -cover ./...` Coverage Summary
| Package | Statement Coverage | Status |
|---|---|---|
| `cmd/excelsior` | **0.0%** | Gaps: CLI flag parsing, subcommands, stdin pipe resolution, logger setup |
| `pkg/agent` | **90.0%** | Excellent |
| `pkg/config` | **40.0%** | Gaps: `ResolveWorkspace` |
| `pkg/engine` | **43.4%** | Gaps: `WSClient.StreamRemote`, error dispatching, `Broadcast` |
| `pkg/llm` | **82.1%** | Strong |
| `pkg/protocol` | **45.5%** | Gaps: `Decode` edge cases |
| `pkg/session` | **74.8%** | Good |
| `pkg/tools` | **59.3%** | Gaps: `runShell` execution/timeout, `grepWalk` binary skips, `edit` size checks |
| `pkg/tui` | **0.0%** | Gaps: No test files (Model updates, commands, ask overlay, viewport) |
| `pkg/util` | **0.0%** | Gaps: No test files (`WriteAtomic`, `Truncate`) |

---

## 4. Test Coverage Gaps & Testability Architecture

```
[cmd/excelsior] (0.0%) ────────┐
[pkg/tui]        (0.0%) ────────┼──> Critical Coverage Gaps to Remediate
[pkg/util]       (0.0%) ────────┤
[pkg/config]    (40.0%) ────────┘
```

### Specific Coverage Gaps to Address
1. **`pkg/util` Tests Needed**:
   - `TestWriteAtomic_Success`: Verify atomic replacement, file contents, permissions (0644/0600), and parent directory creation.
   - `TestWriteAtomic_Overwrite`: Verify atomic update of an already existing file.
   - `TestWriteAtomic_InvalidPath`: Verify error handling when target directory cannot be created or written.
   - `TestTruncate_AsciiAndUnicode`: Test truncation at rune boundaries, multi-byte UTF-8, string shorter than n, string equal to n, string longer than n with ellipsis.
2. **`pkg/tui` Headless Tests Needed**:
   - `TestModel_Init`: Verify initial command is `textinput.Blink`.
   - `TestModel_WindowSize`: Verify viewport and input resize calculation.
   - `TestModel_KeyCommands`: Test `/clear`, `/help`, `/model`, `/quit`.
   - `TestModel_AskOverlayWorkflow`: Simulate `askRequestMsg`, key navigation (up/down/tab), selection by number (1/2/3), manual typing, and `Esc` cancel.
   - `TestModel_StreamEventHandling`: Inject `streamChunkMsg` for text, reasoning, tool start/result, error, and verify block aggregation.
   - `TestModel_ScrollbarAndRendering`: Validate transcript rendering and scrollbar thumb calculations.
3. **`cmd/excelsior` Command Tests Needed**:
   - `TestRootCommand_Flags`: Validate flag defaults and overrides (`--model`, `--workspace`, `--system`, `--session`).
   - `TestModelsCommand`: Verify recommended model list output.
   - `TestVersionCommand`: Verify version string formatting.
   - `TestResolvePrompt`: Test CLI argument join vs stdin redirection.
   - `TestResolveWorkspaceOrCwd`: Test workspace fallback chain.
4. **`pkg/config` Tests Needed**:
   - `TestResolveWorkspace`: Test absolute path resolution, relative path conversion, non-existent directory error, non-directory file error, fallback from flag to config to cwd.
5. **`pkg/engine` Tests Needed**:
   - `TestWSClient_StreamRemote`: Mock WebSocket server testing end-to-end streaming, ask requests, and server-side errors.
   - `TestHub_Broadcast`: Multiple connected clients receiving broadcast envelopes.
   - `TestConn_SendEnvelope_SafeClose`: Concurrency test verifying no panic when sending during connection teardown.

---

## 5. R3 Production Clean Code & Engineering Quality Targets

To satisfy Requirement R3 and project acceptance criteria:

1. **Eliminate All Panics**:
   - In `pkg/protocol/protocol.go:35`, replace `panic(err)` in `MustMarshalPayload` with error-returning functions `MarshalPayload(v any) (json.RawMessage, error)`.
2. **Thread Safety & Race Hardening**:
   - Refactor `pkg/engine/conn.go:sendEnvelope` to ensure channel sends are guarded against concurrent closure.
   - Guard `Hub.Broadcast` against concurrent unregistering.
   - Protect session write-read-modify operations against concurrent race conditions on identical session IDs.
3. **Context & Timeout Hardening**:
   - In `pkg/llm/client.go`, do not set a static 120s `http.Client.Timeout` on streaming clients. Rely on context deadlines.
   - In `pkg/engine/client.go:WSClient.StreamRemote`, bind the websocket read loop to immediate context termination.
4. **Domain Error Hierarchy (R2 Alignment)**:
   - Establish unified error types with `errors.Is` / `errors.As` support across LLM, Agent, Tool, and Engine subsystems, replacing raw formatted strings.
5. **Target Code Coverage Benchmark**:
   - Increase overall repository test coverage to **>85%** by adding missing test suites for `pkg/util`, `pkg/tui`, `cmd/excelsior`, `pkg/config:ResolveWorkspace`, and `pkg/engine:WSClient`.
