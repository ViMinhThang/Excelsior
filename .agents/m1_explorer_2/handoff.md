# Handoff Report: Domain Error Hierarchy, Sentinel Errors, and Panic Elimination
## Packages: `pkg/agent`, `pkg/session`, `pkg/protocol`, `pkg/engine`

**Agent**: m1_explorer_2 (Explorer 2 for Milestone 1)  
**Date**: 2026-08-29  
**Recipient**: Orchestrator (Conversation ID: `8884cc3c-d4d3-4cb8-91b1-a31965788d96`) & M1 Implementer  
**Status**: Complete  

---

## 1. Observation

Direct code analysis of `pkg/agent`, `pkg/session`, `pkg/protocol`, and `pkg/engine` revealed the following concrete issues and structural gaps:

1. **Explicit Panic in `pkg/protocol/protocol.go:35`**:
   ```go
   func MustMarshalPayload(v any) json.RawMessage {
       if v == nil {
           return nil
       }
       b, err := json.Marshal(v)
       if err != nil {
           panic(err) // <--- Direct panic on non-serializable payload
       }
       return b
   }
   ```
   `MustMarshalPayload` is called by `NewEnvelope` (`protocol.go:42`) and `NewEnvelopeWithID` (`protocol.go:47`), which are invoked across all WebSocket message dispatches in `pkg/engine/chat_handler.go`, `pkg/engine/handlers.go`, and `pkg/engine/conn.go`.

2. **Unchecked Nil Pointer Dereference in `pkg/agent/agent.go:190`**:
   ```go
   msg, err := a.LLM.StreamChat(ctx, req, func(d llm.Delta) error { ... })
   if err != nil { ... }
   a.logger().Debug("agent llm response", "iter", iter, "duration", time.Since(llmStart), "toolCalls", len(msg.ToolCalls))
   messages = append(messages, *msg) // <--- PANIC on *msg if msg is nil when err == nil
   ```
   When custom/mock LLM adapters return `nil, nil`, dereferencing `*msg` causes an instant runtime panic.

3. **Unchecked Slice Indexing in `pkg/engine/client.go:109`**:
   ```go
   if askHandler == nil {
       askHandler = func(ctx context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
           // fallback auto-select
           return tools.AskResponse{Selected: 0, Answer: rq.Options[0], Label: rq.Options[0]}, nil // <--- PANIC if rq.Options is empty []
       }
   }
   ```
   If an incoming `AskReq` contains `Options: []`, indexing `rq.Options[0]` panics.

4. **Zero Domain Sentinels or Custom Error Structs**:
   - `pkg/agent`: Emits bare `errors.New("agent: LLM not configured")`, `errors.New("agent: Messages is empty")`, `fmt.Errorf("agent: max iterations (%d) reached", ...)` (`agent.go:83, 141, 204`).
   - `pkg/session`: Emits bare `errors.New("session id is empty")`, `errors.New("session store dir is empty")`, `fmt.Errorf("session load: %w", err)` (`session.go:42, 59, 130`).
   - `pkg/protocol`: Missing `ProtocolError` struct and sentinels for version mismatches and corrupted payloads.
   - `pkg/engine`: Emits ad-hoc strings like `"already streaming, wait for done"`, `fmt.Errorf("engine error: %s", e)` (`conn.go:154`, `client.go:97`).

---

## 2. Logic Chain

1. **From Observation 1**: Because `MustMarshalPayload` explicitly calls `panic(err)`, any unexpected data type passed to envelope constructors crashes the process. Replacing `panic(err)` with a safe `MarshalPayload(v any) (json.RawMessage, error)` and making `MustMarshalPayload` return `nil` on failure eliminates this crash risk while preserving backward compatibility.
2. **From Observation 2**: Because `agent.go:190` directly dereferences `*msg` after `StreamChat`, any `LLM` implementation returning `nil, nil` causes an unrecoverable panic. Adding an explicit guard `if msg == nil { return nil, &AgentError{Phase: "stream_chat", Iteration: iter+1, Err: ErrNilLLMMessage} }` ensures type safety and returns a typed error.
3. **From Observation 3**: Because `client.go:109` accesses `rq.Options[0]` without checking slice length, empty option arrays trigger runtime index panics. Adding `if len(rq.Options) == 0 { return tools.AskResponse{Selected: -1}, nil }` provides safe fallback handling.
4. **From Observation 4**: Because all four packages currently return ad-hoc strings or bare `errors.New`, upper layers (CLI, TUI, E2E tests) cannot programmatically inspect error conditions using Go idioms (`errors.Is` / `errors.As`). Defining domain sentinels and structured error types (`AgentError`, `SessionError`, `ProtocolError`, `EngineError`) with `Unwrap()` and `Is(target error) bool` establishes a clean, typed domain error hierarchy satisfying Project Requirement R2.

---

## 3. Caveats

- **Scope Boundary**: This design covers `pkg/agent`, `pkg/session`, `pkg/protocol`, and `pkg/engine`. The companion packages `pkg/config`, `pkg/llm`, and `pkg/tools` are covered by Explorer 1 (`m1_explorer_1`).
- **Session Store Interface**: The introduction of the `session.Store` interface abstraction (enabling `MemoryStore` alongside `DirStore`) is scheduled for Milestone 2 (M2). The error types designed here (`SessionError` and sentinels) are forward-compatible with both implementations.
- No other caveats.

---

## 4. Conclusion

A complete, production-grade domain error hierarchy, panic elimination, and nil safety design has been established for `pkg/agent`, `pkg/session`, `pkg/protocol`, and `pkg/engine`:

1. **`pkg/agent`**:
   - Sentinels: `ErrMaxIterationsReached`, `ErrContextTooLarge`, `ErrEmptyMessages`, `ErrLLMNotConfigured`, `ErrInvalidConfig`, `ErrNilLLMMessage`.
   - Structured Type: `AgentError{Phase, Iteration, ToolName, Err}` with `Unwrap()` and `Is(target)`.
   - Panic Fix: Guard against `nil` `*msg` at `agent.go:190`.

2. **`pkg/session`**:
   - Sentinels: `ErrSessionNotFound`, `ErrInvalidSessionID`, `ErrCorruptedSession`, `ErrEmptySession`, `ErrStoreDirEmpty`.
   - Structured Type: `SessionError{Op, SessionID, Path, Err}` with `Unwrap()` and `Is(target)`.
   - Error Wrapping: `os.ErrNotExist` is mapped to `ErrSessionNotFound`; corrupt/empty files mapped to typed sentinels.

3. **`pkg/protocol`**:
   - Sentinels: `ErrUnsupportedVersion`, `ErrInvalidPayload`, `ErrCorruptEnvelope`.
   - Structured Type: `ProtocolError{Op, MsgType, Ver, Err}` with `Unwrap()` and `Is(target)`.
   - Safe Serialization: Added `MarshalPayload(v any) (json.RawMessage, error)`, `BuildEnvelope`, and removed `panic(err)` in `MustMarshalPayload`.

4. **`pkg/engine`**:
   - Sentinels: `ErrAlreadyStreaming`, `ErrConnectionClosed`, `ErrClientDisconnected`, `ErrSendBufferFull`, `ErrRemoteEngine`.
   - Structured Type: `EngineError{Op, ClientID, MsgType, Err}` with `Unwrap()` and `Is(target)`.
   - Panic Fix: Guard against empty `rq.Options` at `client.go:109`.

Full implementation blueprints and call site migration tables are documented in `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m1_explorer_2\analysis.md`.

---

## 5. Verification Method

Once implemented by the M1 implementer, the changes can be independently verified using:

1. **Targeted Package Unit & Race Tests**:
   ```bash
   go test -v -race ./pkg/agent/... ./pkg/session/... ./pkg/protocol/... ./pkg/engine/...
   ```
2. **Full Repository Test Suite**:
   ```bash
   go test -race ./...
   ```
3. **Static Analysis & Vet Check**:
   ```bash
   go vet ./...
   ```
4. **Binary Compilation**:
   ```bash
   go build ./cmd/excelsior
   ```
5. **Invalidation Conditions**:
   - Any test using `errors.Is(err, pkg.ErrSentinel)` fails.
   - Any panic occurs during non-serializable payload marshaling in `MustMarshalPayload` or `MarshalPayload`.
   - Any panic occurs when `StreamChat` returns `nil, nil` in `agent.Run`.
   - Any panic occurs when `AskReq` contains empty options in `StreamRemote`.
