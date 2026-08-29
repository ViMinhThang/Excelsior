# Adversarial Challenge Report — Milestone 1

## Challenge Summary

**Overall risk assessment**: LOW (Robust Panic Resistance Verified)
**Final Verdict**: **`APPROVE`**

---

## Adversarial Stress Tests & Attack Scenarios

### Challenge Area 1: Nil and Boundary Paths in `tools.GrepTool`
- **Assumption challenged**: Grep tool might dereference `*a.Path` when `a.Path == nil`, or panic during directory resolution when `t.Root` is a file or when paths contain abnormal unicode/whitespace.
- **Attack scenarios tested**:
  1. `Path: nil` explicitly provided in args map.
  2. `Path` omitted entirely from JSON payload.
  3. `Path: ""` (empty string) and `Path: "   \t\n "` (whitespace-only).
  4. `t.Root` set to a regular file instead of a directory while `Path: nil`.
  5. Path traversal attempt `../../../etc`.
  6. Absolute path attempt `/root/something`.
- **Observed Behavior**:
  - `Path: nil` defaults correctly to `t.Root` and `displayPath = "."`.
  - Non-directory root returns typed `ToolError` with `ErrNotADirectory` wrapped via `fmt.Errorf("%w: %q is not a directory", ErrNotADirectory, displayPath)`.
  - Path traversal and absolute paths return `ErrPathOutsideWorkspace` and `ErrAbsolutePath`.
  - **Panic count**: 0.

### Challenge Area 2: Unparseable, Cyclical, and Degenerate JSON Serialization
- **Assumption challenged**: `protocol.MustMarshalPayload` and `protocol.MarshalPayload` might panic or infinite loop when passed self-referencing pointer structures, unmarshalable Go types (`chan`, `func`, `complex`), or IEEE 754 special floats (`NaN`, `±Inf`).
- **Attack scenarios tested**:
  1. Cyclical pointer struct (`node.Next = node`).
  2. Unmarshalable channels (`chan int`) and functions (`func()`).
  3. Complex numbers (`complex(3.14, 2.71)`).
  4. `math.NaN()`, `math.Inf(1)`, `math.Inf(-1)`.
  5. `NewEnvelope` and `NewEnvelopeWithID` with cyclical payloads.
  6. `Envelope.Decode` against truncated JSON, corrupt tokens, and control characters.
- **Observed Behavior**:
  - `MustMarshalPayload` safely returns `nil` without panic on all unmarshalable, cyclical, and degenerate inputs.
  - `MarshalPayload` returns `(nil, *ProtocolError)` wrapping `ErrInvalidPayload`.
  - `NewEnvelope` creates safe envelopes with `Payload: nil`.
  - `Envelope.Decode` returns `*ProtocolError` with `ErrInvalidPayload` on corrupt data, and `nil` on empty data.
  - **Panic count**: 0.

### Challenge Area 3: Empty Options & Fallbacks in `engine/client.go` and `tools.AskTool`
- **Assumption challenged**: Invoking `StreamRemote` or `AskTool` with empty or nil options could cause an index out of range panic (`rq.Options[0]`).
- **Attack scenarios tested**:
  1. `protocol.TypeAskReq` with `Options: nil` handled by default fallback handler.
  2. `protocol.TypeAskReq` with `Options: []string{}` handled by default fallback handler.
  3. `protocol.TypeAskReq` with custom handler returning error.
  4. `protocol.TypeAskReq` with custom handler returning manual text input (`Selected: -1`).
  5. `AskTool.Execute` with nil options, empty options, 1 option, and 5 options.
- **Observed Behavior**:
  - Fallback handler guards `len(rq.Options) == 0` and returns `AskResponse{Selected: -1, Answer: "", Label: ""}`, completely avoiding slice index out of range.
  - Custom handler errors are caught, logged, and gracefully returned as `Selected: -1`.
  - `AskTool.Execute` pads slice to exactly 3 options if under 3, and truncates if over 3.
  - **Panic count**: 0.

### Challenge Area 4: Nil Return from Custom LLM Stream in `agent.Agent.Run`
- **Assumption challenged**: If `a.LLM.StreamChat(...)` returns `(nil, nil)` or emits deltas before returning `(nil, nil)`, `Agent.Run` or `Agent.RunWithHistory` might dereference `*msg` (e.g. `messages = append(messages, *msg)`).
- **Attack scenarios tested**:
  1. Mock LLM returns `(nil, nil)` on turn 1.
  2. Mock LLM emits text/reasoning deltas and then returns `(nil, nil)`.
  3. Mock LLM returns `(nil, customErr)`.
  4. Mock LLM returns empty message (`Content: "", ReasoningContent: "", ToolCalls: nil`).
- **Observed Behavior**:
  - `msg == nil` is explicitly checked before dereference at `agent.go:188`.
  - Emits `StreamEvent{Type: "error", Text: ErrNilLLMMessage.Error()}`.
  - Returns `*AgentError` with `Phase: "stream_chat"` and `Err: ErrNilLLMMessage`.
  - Empty assistant message loops cleanly until non-empty response or iteration limit without panics.
  - **Panic count**: 0.

---

## Stress Test Results Matrix

| Scenario | Target Component | Input | Expected Outcome | Actual Outcome | Status |
|---|---|---|---|---|---|
| Grep Nil Path | `pkg/tools/grep.go` | `GrepArgs{Path: nil}` | Default to Root, zero panic | Defaulted to Root, matched lines | **PASS** |
| Grep File Root Nil Path | `pkg/tools/grep.go` | File as Root + `Path: nil` | `ErrNotADirectory`, zero panic | Returned `ErrNotADirectory`, zero panic | **PASS** |
| Grep Traversal Path | `pkg/tools/grep.go` | `Path: "../../../etc"` | `ErrPathOutsideWorkspace` | Returned `ErrPathOutsideWorkspace` | **PASS** |
| Cyclical Payload Marshal | `pkg/protocol/protocol.go` | `CyclicalNode{Next: &self}` | Return `nil` (Must) / `ErrInvalidPayload` (Marshal) | Returned `nil` / typed `*ProtocolError`, zero panic | **PASS** |
| NaN/Inf Float Payload | `pkg/protocol/protocol.go` | `math.NaN()`, `math.Inf(1)` | Return `nil` / `ErrInvalidPayload` | Returned `nil` / typed `*ProtocolError`, zero panic | **PASS** |
| Degenerate Envelope Decode | `pkg/protocol/protocol.go` | Corrupt JSON string | Return `ErrInvalidPayload`, zero panic | Returned `*ProtocolError` with `ErrInvalidPayload` | **PASS** |
| WSClient Ask Nil Options | `pkg/engine/client.go` | `AskReq{Options: nil}` | Default handler returns `Selected: -1`, zero panic | Returned `Selected: -1`, zero panic | **PASS** |
| WSClient Ask Handler Error | `pkg/engine/client.go` | Handler returns error | Fallback `Selected: -1`, zero panic | Returned `Selected: -1`, zero panic | **PASS** |
| AskTool Padding/Truncation | `pkg/tools/ask.go` | 0 options, 1 option, 5 options | Exact 3 options guaranteed | Padded to 3 / truncated to 3, zero panic | **PASS** |
| Agent Nil LLM Message | `pkg/agent/agent.go` | `StreamChat -> (nil, nil)` | Return `ErrNilLLMMessage`, emit error event, zero panic | Returned `ErrNilLLMMessage`, emitted error event | **PASS** |
| Agent Nil LLM with Deltas | `pkg/agent/agent.go` | Deltas then `(nil, nil)` | Return `ErrNilLLMMessage`, zero panic | Returned `ErrNilLLMMessage`, zero panic | **PASS** |
| Agent Empty Message Loop | `pkg/agent/agent.go` | Empty content/reasoning/tools | Loop to next turn cleanly | Looped to next turn, returned final text | **PASS** |

---

## Static Analysis & Build Verification
- `go vet ./...`: 0 diagnostic errors.
- `go test -v -count=1 ./...`: 100% PASS across all packages.
- `go build ./cmd/excelsior`: Clean build.

## Final Verdict
**`APPROVE`**
