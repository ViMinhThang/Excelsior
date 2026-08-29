# Milestone 1 Review Report (Reviewer 2 — Adversarial & Quality)

## Review Summary

**Verdict**: **APPROVE**
**Overall Risk Assessment**: LOW
**Static Analysis & Test Status**:
- go build ./...: **PASS** (0 errors)
- go vet ./...: **PASS** (0 warnings/diagnostics)
- go test -count=1 -v ./...: **PASS** (100% green across all packages)

---

## 1. Domain Error Hierarchy & Typing Inspection

All 7 core packages (pkg/config, pkg/llm, pkg/tools, pkg/agent, pkg/session, pkg/protocol, pkg/engine) define comprehensive domain sentinel errors and structured error types satisfying the Go error unwrapping and matching conventions (Error() string, Unwrap() error, Is(target error) bool):

| Package | Structured Error Type | Sentinel Errors Defined | Unwrap / Is Support |
|---|---|---|---|
| pkg/config | ConfigError | ErrMissingAPIKey, ErrMissingModel, ErrInvalidBaseURL, ErrInvalidTemperature, ErrInvalidWorkspace, ErrWorkspaceNotFound, ErrWorkspaceNotDir | Verified (errors.Is, errors.As) |
| pkg/llm | LLMError (ErrorKind) | ErrMissingAPIKey, ErrAuthFailed, ErrRateLimit, ErrServerUnavailable, ErrInvalidRequest, ErrStreamInterrupted, ErrLineTooLarge, ErrInvalidBaseURL | Verified (errors.Is, errors.As) |
| pkg/tools | ToolError | ErrToolNotFound, ErrInvalidArguments, ErrEmptyPath, ErrAbsolutePath, ErrPathOutsideWorkspace, ErrFileTooLarge, ErrCommandTooLong, ErrCommandTimeout, ErrTextNotFound, ErrAmbiguousMatch, ErrNotADirectory, ErrIsADirectory, ErrOffsetOutOfRange | Verified (errors.Is, errors.As) |
| pkg/agent | AgentError | ErrMaxIterationsReached, ErrContextTooLarge, ErrEmptyMessages, ErrLLMNotConfigured, ErrInvalidConfig, ErrInvalidMaxIterations, ErrNilLLMMessage, ErrUnknownTool | Verified (errors.Is, errors.As) |
| pkg/session | SessionError | ErrInvalidSessionID, ErrEmptySessionID, ErrSessionNotFound, ErrEmptySession, ErrCorruptedSession, ErrStoreDirEmpty | Verified (errors.Is, errors.As) |
| pkg/protocol | ProtocolError | ErrUnsupportedVersion, ErrInvalidPayload, ErrCorruptEnvelope, ErrMarshalFailed, ErrUnmarshalFailed, ErrUnknownType | Verified (errors.Is, errors.As) |
| pkg/engine | EngineError | ErrAlreadyStreaming, ErrConnectionClosed, ErrClientDisconnected, ErrSendBufferFull, ErrRemoteEngine, ErrInvalidURL, ErrConnectionFailed | Verified (errors.Is, errors.As) |

---

## 2. Panic Fixes & Nil Pointer Dereference Guard Verifications

### A. Protocol Serialization Panic Elimination (pkg/protocol/protocol.go)
- **Observation**: MustMarshalPayload(v any) previously called panic(err) when JSON serialization failed.
- **Fix Verified**: MustMarshalPayload now returns 
il on error. Safe variant MarshalPayload(v any) (json.RawMessage, error) and BuildEnvelope(id, typ, payload) (Envelope, error) return typed *ProtocolError with sentinel ErrInvalidPayload.
- **Adversarial Test**: Tested unmarshalable channel and cyclic inputs; verified non-panicking execution and structured error return.

### B. Tool Nil Path Dereference Guard (pkg/tools/grep.go)
- **Observation**: grep.go dereferenced *a.Path during error construction on nonexistent directories or stat failures when .Path was nil.
- **Fix Verified**: displayPath is safely initialized to "." and assigned *a.Path only when non-nil and non-whitespace. Stat and directory errors format displayPath without dereferencing a nil pointer.
- **Adversarial Test**: TestGrep_NilPathAndAdversarialPaths and TestGrep_NonDirectoryRootWithNilPath pass with explicit 
il path parameters and corrupted directories.

### C. Agent Nil LLM Message Guard (pkg/agent/agent.go)
- **Observation**: gent.go:190 dereferenced *msg after .LLM.StreamChat(...) without verifying whether msg was non-nil.
- **Fix Verified**: Explicit if msg == nil check returning &AgentError{Phase: "stream_chat", Iteration: iter + 1, Err: ErrNilLLMMessage} and emitting an error event before any dereference.
- **Adversarial Test**: TestAgent_NilLLMMessageGuard verifies graceful error return when LLM returns (nil, nil).

### D. Engine AskHandler Empty Options Guard (pkg/engine/client.go)
- **Observation**: client.go:109 indexed q.Options[0] in default fallback question handler, which panicked on empty or nil options slices.
- **Fix Verified**: if len(rq.Options) == 0 guard returns {Selected: -1, Answer: "", Label: ""} safely.
- **Adversarial Test**: TestEngine_AskHandlerEmptyOptionsGuard and TestStreamRemote_AskHandlerEmptyAndNilOptions verify nil and empty options slices without index out of range panic.

### E. Config Schemeless URL Nil-Wrapping Guard (pkg/config/config.go)
- **Observation**: Schemeless URL parsing returned 
il from mt.Errorf("%w", nil), causing invalid URLs to bypass validation.
- **Fix Verified**: Explicit validation u.Scheme == "" || u.Host == "" directly returns ErrInvalidBaseURL.

---

## 3. Typed Retry Policy Verification (pkg/llm/retry.go)

- Replaced fragile substring matching with LLMError.IsRetryable() and typed error unwrapping.
- Accurately identifies retryable errors (HTTP 429, 5xx, ErrRateLimit, ErrServerUnavailable, ErrStreamInterrupted, context.DeadlineExceeded, generic network disconnects) while rejecting non-retryable errors (context.Canceled, HTTP 400, 401, 403, 404, ErrMissingAPIKey, ErrInvalidRequest, ErrAuthFailed).

---

## 4. Adversarial Stress Testing & Integrity Audit

- **Integrity Violation Check**: **CLEAN**. No hardcoded outputs, dummy facades, test shortcuts, or bypass mechanisms detected in source or test code.
- **Concurrency & Resource Safety**:
  - pkg/engine/engine_test.go: TestHub_WorkspaceConcurrency stress-tests concurrent reads and updates across 50 goroutines.
  - Context cancellations and timeouts are checked at every iteration loop, tool invocation, and HTTP stream chunk.

---

## 5. Verification Commands & Independent Proof

`powershell
go build ./...
go vet ./...
go test -count=1 -v ./...
`
All commands execute cleanly with exit code 0.
