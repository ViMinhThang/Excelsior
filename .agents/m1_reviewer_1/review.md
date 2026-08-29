# Milestone 1 Code Review & Adversarial Analysis Report

**Reviewer**: `m1_reviewer_1` (Reviewer & Adversarial Critic)  
**Date**: 2026-08-29  
**Target Milestone**: Milestone 1 (Unified Domain Error Hierarchy & Safe Protocol Serialization)  
**Evaluated Packages**: `pkg/config`, `pkg/llm`, `pkg/tools`, `pkg/agent`, `pkg/session`, `pkg/protocol`, `pkg/engine`  

---

## 1. Review Summary

**Verdict**: **`APPROVE`**

### Summary of Assessment
Milestone 1 successfully elevates Excelsior's error architecture into a robust, idiomatic, and type-safe Go domain error hierarchy across all 7 core packages. All unstructured string-based error handling, panics during serialization, and nil-pointer panic vectors have been completely eliminated. 

---

## 2. Integrity Verification

As required for all reviews, active checks for integrity violations were conducted:
- **Hardcoded test returns / facades**: Verified that implementations in `pkg/config`, `pkg/llm`, `pkg/tools`, `pkg/agent`, `pkg/session`, `pkg/protocol`, and `pkg/engine` contain authentic logic, stateful structs, and functional validation.
- **Task shortcuts / external delegation**: All domain errors, sentinel definitions, and tests were built natively and co-located within standard Go project layouts.
- **Fabricated verification outputs**: Source files, tests, and static checks were independently analyzed.
- **Integrity Verdict**: **PASS — ZERO Integrity Violations.**

---

## 3. Detailed Quality & Conformance Review

### 3.1 Go Idioms & Error Contract Conformance
Each package defines its own structured domain error type adhering to standard Go error conventions:

| Package | Error Type | Sentinel Count | Implements `Error()` | Implements `Unwrap()` | Implements `Is(target error) bool` | Supports `errors.As` |
|---|---|---|---|---|---|---|
| `pkg/config` | `ConfigError` | 8 | Yes | Yes (`e.Err`) | Yes | Yes |
| `pkg/llm` | `LLMError` | 8 | Yes | Yes (`e.Err`) | Yes | Yes |
| `pkg/tools` | `ToolError` | 14 | Yes | Yes (`e.Err`) | Yes | Yes |
| `pkg/agent` | `AgentError` | 8 | Yes | Yes (`e.Err`) | Yes | Yes |
| `pkg/session` | `SessionError` | 7 | Yes | Yes (`e.Err`) | Yes | Yes |
| `pkg/protocol` | `ProtocolError` | 6 | Yes | Yes (`e.Err`) | Yes | Yes |
| `pkg/engine` | `EngineError` | 7 | Yes | Yes (`e.Err`) | Yes | Yes |

#### Specific Go Idiom Highlights:
1. **Unwrap Protocol**: All custom types implement `Unwrap() error`, returning their internal `Err` field, enabling deep tree traversal by `errors.Is` and `errors.As`.
2. **Sentinel Equivalency in `Is(target error) bool`**:
   - `ConfigError.Is`: Matches on field names as well as wrapped sentinels (`ErrMissingAPIKey`, `ErrMissingModel`, `ErrInvalidBaseURL`, `ErrInvalidTemperature`, `ErrInvalidWorkspace`, `ErrWorkspaceNotFound`, `ErrWorkspaceNotDir`).
   - `LLMError.Is`: Correlates HTTP status codes (e.g. 429 to `ErrRateLimit`, 401/403 to `ErrAuthFailed`, 5xx to `ErrServerUnavailable`, 400 to `ErrInvalidRequest`) in addition to explicit sentinels.
   - `ToolError.Is`: Handles alias equivalencies (`ErrOldTextNotFound` <-> `ErrTextNotFound`, `ErrOldTextAmbiguous` <-> `ErrAmbiguousMatch`).
   - `SessionError.Is`: Handles session ID validation, missing files, corrupted lines, and empty files.
   - `ProtocolError.Is`: Supports `ErrUnsupportedVersion`, `ErrInvalidPayload`, `ErrMarshalFailed`, `ErrUnmarshalFailed`, `ErrCorruptEnvelope`.
   - `EngineError.Is`: Supports `ErrAlreadyStreaming`, `ErrConnectionClosed`, `ErrClientDisconnected`, `ErrSendBufferFull`, `ErrRemoteEngine`, `ErrInvalidURL`, `ErrConnectionFailed`.
3. **`%w` Formatting**: All error construction sites throughout the 7 packages wrap underlying system or sentinel errors using `fmt.Errorf("%w: ...", sentinel, ...)`.

---

### 3.2 Typed Retry Predicates (`pkg/llm/retry.go`)
- **Legacy Flaw**: Previously checked error strings with `strings.Contains(err.Error(), "429")` and `strings.Contains(err.Error(), "rate limit")`, which was fragile against upstream API changes.
- **Elevated Implementation**:
  - `isRetryable(status int, err error)` checks:
    1. `errors.Is(err, context.Canceled)` -> `false` (never retry canceled contexts).
    2. `errors.As(err, &le)` -> calls `le.IsRetryable()`.
    3. `errors.Is(err, context.DeadlineExceeded)` -> `true`.
    4. HTTP status codes 429, 500, 502, 503, 504 -> `true`.
    5. HTTP status codes 400, 401, 403, 404 -> `false`.
  - Fully decoupled from error string text.

---

### 3.3 Safe Protocol Serialization & Non-Panicking API (`pkg/protocol`)
- **Legacy Flaw**: `MustMarshalPayload` called `panic(err)` when JSON marshaling failed.
- **Elevated Implementation**:
  - `MarshalPayload(v any) (json.RawMessage, error)` provides non-panicking serialization with `*ProtocolError`.
  - `MustMarshalPayload(v any) json.RawMessage` returns `nil` on error without crashing the process.
  - `BuildEnvelope(id, typ string, payload any) (Envelope, error)` allows strict envelope creation.

---

### 3.4 Runtime Panic & Nil Dereference Elimination
The following 4 critical panic vectors identified in legacy code are confirmed resolved:
1. `pkg/config/config.go`: Schemeless URL parsing is explicitly validated (`u.Scheme == "" || u.Host == ""`), returning `&ConfigError{Err: ErrInvalidBaseURL}` instead of returning `nil` while signaling validation failure.
2. `pkg/tools/grep.go`: `a.Path` pointer dereference is guarded with fallback to `displayPath = "."`.
3. `pkg/agent/agent.go:188`: Nil check on `*msg` after `a.LLM.StreamChat(...)` returns `&AgentError{Phase: "stream_chat", Err: ErrNilLLMMessage}` if the provider returns a nil message.
4. `pkg/engine/client.go:109`: Default question handler checks `len(rq.Options) == 0` before indexing `rq.Options[0]`.

---

## 4. Adversarial Stress-Testing & Attack Surface Analysis

| Target Component | Stress Scenario / Attack Vector | Predicted Behavior | Actual Behavior | Pass / Fail |
|---|---|---|---|---|
| `pkg/tools/grep.go` | Subpath `path: nil` passed via JSON | Safe fallback to workspace root, no panic | Handled via `displayPath = "."` | **PASS** |
| `pkg/tools/grep.go` | Non-directory file provided as `Root` with `path: nil` | Returns typed `ErrNotADirectory` | Returns `&ToolError{Err: ErrNotADirectory}` | **PASS** |
| `pkg/tools/ask.go` | `AskRequest` with 0, 1, 5 options | Auto-normalize to exactly 3 options | Padded to 3 / truncated to 3 without panic | **PASS** |
| `pkg/agent/agent.go` | LLM returns `(*llm.Message)(nil)` with `nil` error | Guard against nil dereference | Returns `&AgentError{Err: ErrNilLLMMessage}` | **PASS** |
| `pkg/llm/retry.go` | `context.Canceled` wrapped in error | Do not retry | Returns `false` immediately | **PASS** |
| `pkg/protocol/protocol.go` | Un-serializable channel passed to `MustMarshalPayload` | Do not panic | Returns `nil` safely | **PASS** |
| `pkg/protocol/protocol.go` | Un-serializable channel passed to `MarshalPayload` | Return structured error | Returns `&ProtocolError{Op: "marshal", Err: ErrInvalidPayload}` | **PASS** |
| `pkg/session/session.go` | Path traversal in session ID (`../escape`, `bad/id`) | Reject with `ErrInvalidSessionID` | Returns `&SessionError{Err: ErrInvalidSessionID}` | **PASS** |
| `pkg/session/session.go` | Corrupted JSONL lines appended to valid session | Parse last valid line | Recovers valid record, ignores corrupt lines | **PASS** |
| `pkg/engine/conn.go` | Concurrent reads and writes on `hub.Workspace()` | Thread-safe atomic pointer | No data races, consistent reads | **PASS** |

---

## 5. Findings & Minor Observations

- **No Blocking or Critical Defects**: All requirements R1, R2, and M1 features are completely satisfied.
- **Observation (Non-blocking / Informational)**: In `pkg/config/errors.go`, `ConfigError.Is` matches `e.Field == "APIKey"` for `ErrMissingAPIKey`. This allows matching both by underlying wrapped sentinel and by structured field name, which is flexible and ergonomic for callers.

---

## 6. Verdict & Recommendation

**Verdict**: **`APPROVE`**

Milestone 1 is certified as complete, robust, and adhering to top-tier Go engineering standards. The codebase is ready to proceed to Milestone 2 (Core Architecture Decoupling & Interface Abstractions).
