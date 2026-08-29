# Milestone 1: Domain Errors, Sentinels, and Wrapping Refactoring

## Summary of Changes

Milestone 1 implements a comprehensive, idiomatic Go 1.13+ domain error architecture across all 7 core packages of Excelsior (`pkg/config`, `pkg/llm`, `pkg/tools`, `pkg/agent`, `pkg/session`, `pkg/protocol`, `pkg/engine`), replacing unstructured string errors and raw formatting with typed domain error structs, package-level sentinels, full `errors.Is` / `errors.As` support, and fixing critical panic / nil-pointer runtime bugs.

---

## Changes by Package

### 1. `pkg/config`
- **`pkg/config/errors.go`** (NEW):
  - Defined sentinels: `ErrMissingAPIKey`, `ErrMissingModel`, `ErrInvalidBaseURL`, `ErrInvalidTemperature`, `ErrInvalidWorkspace`, `ErrWorkspaceNotFound`, `ErrWorkspaceNotDir`, `ErrNotADirectory`.
  - Defined `ConfigError` with `Field string`, `Value any`, `Err error`. Implements `Error() string`, `Unwrap() error`, `Is(target error) bool`.
- **`pkg/config/config.go`**:
  - Refactored `Validate()` and `ResolveWorkspace()` to return typed `*ConfigError` wrapping appropriate sentinels.
  - Fixed nil `%w` formatting bug when `url.Parse` returned a nil error on URLs lacking schemes.
- **`pkg/config/config_test.go`**:
  - Updated table-driven tests to assert error identities using `errors.Is(err, config.Err...)` and inspect fields with `errors.As(err, &cfgErr)`.

### 2. `pkg/llm`
- **`pkg/llm/errors.go`** (NEW):
  - Defined sentinels: `ErrMissingAPIKey`, `ErrAuthFailed`, `ErrRateLimit`, `ErrServerUnavailable`, `ErrInvalidRequest`, `ErrStreamInterrupted`, `ErrLineTooLarge`, `ErrInvalidBaseURL`.
  - Defined `ErrorKind` enum (`ErrorKindAuth`, `ErrorKindRateLimit`, `ErrorKindServer`, `ErrorKindClient`, `ErrorKindStream`, `ErrorKindValidation`, `ErrorKindConfig`).
  - Defined `LLMError` with `Kind ErrorKind`, `StatusCode int`, `Err error`. Implements `Error() string`, `Unwrap() error`, `Is(target error) bool`, and `IsRetryable() bool`.
- **`pkg/llm/retry.go`**:
  - Replaced fragile string matching (`strings.Contains(msg, ...)`) with typed `LLMError.IsRetryable()` / `errors.Is(err, ErrRateLimit | ErrServerUnavailable)`.
- **`pkg/llm/client.go`**:
  - Updated HTTP response handling to return `*LLMError` with status codes and mapped sentinels (401/403 -> `ErrAuthFailed`, 429 -> `ErrRateLimit`, 500/502/503/504 -> `ErrServerUnavailable`, 400/422 -> `ErrInvalidRequest`).
- **`pkg/llm/sse.go`**:
  - Updated SSE scanner error handling to return `*LLMError` wrapping `ErrLineTooLarge` and `ErrStreamInterrupted`.
- **`pkg/llm/deepseek_test.go` & `pkg/llm/llm_test.go`**:
  - Updated tests with `errors.Is(err, llm.Err...)` assertions and verified retry behavior on status 429.

### 3. `pkg/tools`
- **`pkg/tools/errors.go`** (NEW):
  - Defined sentinels: `ErrToolNotFound`, `ErrInvalidArguments`, `ErrEmptyPath`, `ErrAbsolutePath`, `ErrPathOutsideWorkspace`, `ErrFileTooLarge`, `ErrCommandTooLong`, `ErrCommandTimeout`, `ErrTextNotFound`, `ErrOldTextNotFound`, `ErrAmbiguousMatch`, `ErrOldTextAmbiguous`, `ErrNotADirectory`, `ErrIsADirectory`, `ErrOffsetOutOfRange`.
  - Defined `ToolError` with `Tool string`, `Op string`, `Path string`, `Msg string`, `Err error`. Implements `Error() string`, `Unwrap() error`, `Is(target error) bool`.
- **`pkg/tools/secure.go`**:
  - Refactored `secureJoin` to return `*ToolError` wrapping `ErrEmptyPath`, `ErrAbsolutePath`, and `ErrPathOutsideWorkspace`.
- **`pkg/tools/grep.go`**:
  - Fixed nil `*a.Path` pointer dereference panic bug.
  - Refactored `Execute()` to return `*ToolError` wrapping `ErrInvalidArguments`, `ErrNotADirectory`, and filesystem errors.
- **`pkg/tools/glob.go`**:
  - Refactored to check `walkGlob` errors properly and return `*ToolError`.
- **`pkg/tools/bash.go`, `view.go`, `write.go`, `edit.go`, `ls.go`, `ask.go`**:
  - Refactored each tool's `Execute` method to return structured `*ToolError` instances wrapping respective domain sentinels (`ErrInvalidArguments`, `ErrFileTooLarge`, `ErrCommandTooLong`, `ErrTextNotFound`, `ErrAmbiguousMatch`, `ErrOffsetOutOfRange`, `ErrIsADirectory`).
- **`pkg/tools/tools_test.go`**:
  - Updated all tool test cases to use `errors.Is(err, tools.Err...)` assertions.

### 4. `pkg/agent`
- **`pkg/agent/errors.go`** (NEW):
  - Defined sentinels: `ErrMaxIterationsReached`, `ErrContextTooLarge`, `ErrEmptyMessages`, `ErrLLMNotConfigured`, `ErrInvalidConfig`, `ErrInvalidMaxIterations`, `ErrNilLLMMessage`, `ErrUnknownTool`.
  - Defined `AgentError` with `Phase string`, `Iteration int`, `ToolName string`, `Msg string`, `Err error`. Implements `Error() string`, `Unwrap() error`, `Is(target error) bool`.
- **`pkg/agent/agent.go`**:
  - Refactored `validate()`, `RunWithHistory()`, and `execTools()` to return `*AgentError`.
  - **Fixed nil pointer dereference panic bug at line 190**: Guarded `msg == nil` from `StreamChat` with `if msg == nil { return nil, &AgentError{Phase: "stream_chat", Iteration: iter + 1, Err: ErrNilLLMMessage} }` before dereferencing `*msg`.
- **`pkg/agent/agent_test.go`**:
  - Updated test assertions to use `errors.Is(err, agent.Err...)` and `errors.As(err, &agentErr)`.
  - Added `TestAgent_NilLLMMessageGuard` verifying that a nil LLM response produces `ErrNilLLMMessage` without panicking.

### 5. `pkg/session`
- **`pkg/session/errors.go`** (NEW):
  - Defined sentinels: `ErrSessionNotFound`, `ErrInvalidSessionID`, `ErrEmptySessionID`, `ErrCorruptedSession`, `ErrEmptySession`, `ErrStoreDirEmpty`, `ErrEmptyStoreDir`.
  - Defined `SessionError` with `Op string`, `SessionID string`, `Path string`, `Msg string`, `Err error`. Implements `Error() string`, `Unwrap() error`, `Is(target error) bool`.
- **`pkg/session/session.go`**:
  - Mapped `os.ErrNotExist` in `LoadRecord` to `ErrSessionNotFound`.
  - Refactored `sanitizeID`, `path`, `SaveWithTitle`, `LoadRecord`, `List`, `Delete`, `Prune` to return `*SessionError`.
- **`pkg/session/session_test.go`**:
  - Updated tests with `errors.Is(err, session.Err...)` assertions.
  - Added `TestStore_NotFoundAndCorruptionErrors` covering `ErrSessionNotFound`, `ErrEmptySession`, and `ErrCorruptedSession`.

### 6. `pkg/protocol`
- **`pkg/protocol/errors.go`** (NEW):
  - Defined sentinels: `ErrUnsupportedVersion`, `ErrInvalidPayload`, `ErrCorruptEnvelope`, `ErrMarshalFailed`, `ErrUnmarshalFailed`, `ErrUnknownType`.
  - Defined `ProtocolError` with `Op string`, `MsgType string`, `Ver string`, `Msg string`, `Err error`. Implements `Error() string`, `Unwrap() error`, `Is(target error) bool`.
- **`pkg/protocol/protocol.go`**:
  - **Eliminated panic in `MustMarshalPayload`**: Updated to return `nil` on marshal error without panicking.
  - Added `MarshalPayload(v any) (json.RawMessage, error)` returning typed `*ProtocolError`.
  - Added `BuildEnvelope(id, typ string, payload any) (Envelope, error)`.
  - Updated `Decode(v any)` to return `*ProtocolError` wrapping `ErrInvalidPayload`.
- **`pkg/protocol/protocol_test.go`**:
  - Added `TestMustMarshalPayload_NonPanicking`, `TestMarshalPayload_Errors`, `TestEnvelopeDecode_Errors`, `TestBuildEnvelope`.

### 7. `pkg/engine`
- **`pkg/engine/errors.go`** (NEW):
  - Defined sentinels: `ErrAlreadyStreaming`, `ErrConnectionClosed`, `ErrClientDisconnected`, `ErrSendBufferFull`, `ErrRemoteEngine`, `ErrInvalidURL`, `ErrConnectionFailed`.
  - Defined `EngineError` with `Op string`, `ClientID string`, `MsgType string`, `Msg string`, `Err error`. Implements `Error() string`, `Unwrap() error`, `Is(target error) bool`.
- **`pkg/engine/client.go`**:
  - **Fixed `rq.Options[0]` panic on empty options slice in fallback askHandler**: Guarded with `if len(rq.Options) == 0 { return tools.AskResponse{Selected: -1, Answer: "", Label: ""}, nil }`.
  - Refactored `StreamRemote` to return `*EngineError` for dial, read, write, and remote engine error envelopes.
- **`pkg/engine/engine_test.go`**:
  - Added `TestEngine_AskHandlerEmptyOptionsGuard` testing ask request with nil/empty options slice.
  - Added `TestEngine_TypedEngineErrorInspection` verifying `errors.Is(err, ErrRemoteEngine)` and `ErrInvalidURL`.

---

## Verification Results

- `go build ./...`: **PASS** (all targets and binaries compile cleanly)
- `go vet ./...`: **PASS** (0 warnings or lint issues)
- `go test -count=1 ./...`: **PASS** (100% green across all 7 packages)
