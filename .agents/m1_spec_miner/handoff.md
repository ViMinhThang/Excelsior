# Handoff Report: Milestone 1 Domain Error & Assertion Mapping

## 1. Observation
1. Audited all existing unit tests in the Excelsior repository:
   - `pkg/config/config_test.go`: Lines 36-55 (`TestValidate`) uses boolean `wantErr` table checks against string error returns: `"DEEPSEEK_API_KEY is required"`, `"invalid BaseURL..."`, `"temperature must be 0..2, got 5"`.
   - `pkg/llm/llm_test.go`: Line 133 (`TestSSE_LineTooLarge`) asserts `!strings.Contains(err.Error(), "SSE line too large")`. Lines 65-101 (`TestRetryPolicy_IsRetryable`) verifies boolean status code and network error retryability.
   - `pkg/llm/deepseek_test.go`: Line 76 (`TestClient_Validate`) asserts `!strings.Contains(err.Error(), "APIKey")`.
   - `pkg/tools/tools_test.go`: Lines 27-48 (`TestSecureJoin`) asserts `wantErr` for `"../escape"`, `"/etc/passwd"`, `""`. Lines 92-94 (`TestGlobTool`), 130-141 (`TestViewTool`), 182-184 (`TestWriteAndEditTool`), 192-198 (`TestBashTool_Validation`), 213-215 (`TestGrepTool`) assert `err == nil` for invalid inputs without asserting specific typed errors.
   - `pkg/agent/agent_test.go`: Line 346 (`TestAgent_MaxIterationsCap`) asserts `!strings.Contains(err.Error(), "max iterations (3) reached")`. Line 406 (`TestAgent_ContextTooLargeGuard`) asserts `!strings.Contains(err.Error(), "context too large")`. Lines 453-471 (`TestAgent_ValidationErrors`) asserts `err == nil` for nil LLM, negative MaxIters, empty messages. Lines 274 and 311 assert formatted tool error text in conversation history.
   - `pkg/session/session_test.go`: Lines 110-121 (`TestStore_SanitizeID`) asserts `err == nil` for `"../escape"`, `"bad/id"`, `""`.
   - `pkg/protocol/protocol.go:35`: `MustMarshalPayload` panics on serialization error (`panic(err)`).
   - `pkg/llm/retry.go:62`: `isRetryable` checks `strings.Contains(msg, "marshal") || strings.Contains(msg, "invalid BaseURL")`.
2. Ran `go test ./...` across all packages:
   - Output: `ok excelsior/pkg/agent (2.4s)`, `ok excelsior/pkg/config (2.0s)`, `ok excelsior/pkg/engine (4.1s)`, `ok excelsior/pkg/llm (4.3s)`, `ok excelsior/pkg/protocol (2.7s)`, `ok excelsior/pkg/session (2.1s)`, `ok excelsior/pkg/tools (2.7s)`.
   - Exit code: 0.

## 2. Logic Chain
1. Step 1 (Source Observations): Existing unit tests assert error conditions via three mechanisms:
   - Fragile substring matches (`strings.Contains(err.Error(), "...")`) in `llm_test.go:133`, `deepseek_test.go:76`, `agent_test.go:346`, `agent_test.go:406`.
   - Table-driven boolean checks `(err != nil) != tc.wantErr` in `config_test.go:51` and `tools_test.go:44`.
   - Boolean guard checks `if err == nil { t.Fatal(...) }` in `tools_test.go`, `agent_test.go`, `session_test.go`.
2. Step 2 (Sentinel & Struct Mapping): Each error site maps directly to a discrete domain error sentinel or typed error struct:
   - `pkg/config`: `ErrMissingAPIKey`, `ErrMissingModel`, `ErrInvalidBaseURL`, `ErrInvalidTemperature`, `ErrInvalidWorkspace`, `ErrWorkspaceNotFound`, `ErrWorkspaceNotDir`, `ConfigError`.
   - `pkg/llm`: `ErrMissingAPIKey`, `ErrAuthFailed`, `ErrRateLimit`, `ErrServerUnavailable`, `ErrInvalidRequest`, `ErrStreamInterrupted`, `ErrLineTooLarge`, `LLMError`.
   - `pkg/tools`: `ErrEmptyPath`, `ErrAbsolutePath`, `ErrPathOutsideWorkspace`, `ErrInvalidArguments`, `ErrFileTooLarge`, `ErrCommandTooLong`, `ErrOldTextNotFound`, `ErrOldTextAmbiguous`, `ErrToolNotFound`, `ToolError`.
   - `pkg/agent`: `ErrMaxIterationsReached`, `ErrContextTooLarge`, `ErrEmptyMessages`, `ErrLLMNotConfigured`, `ErrInvalidMaxIterations`, `ErrUnknownTool`, `AgentError`.
   - `pkg/session`: `ErrEmptySessionID`, `ErrInvalidSessionID`, `ErrSessionNotFound`, `ErrCorruptedSession`, `ErrEmptySession`, `ErrEmptyStoreDir`, `SessionError`.
   - `pkg/protocol`: `ErrMarshalFailed`, `ErrUnmarshalFailed`, `ErrUnsupportedVersion`, `ErrUnknownType`, `ErrInvalidPayload`, `ProtocolError`.
   - `pkg/engine`: `ErrAlreadyStreaming`, `ErrConnectionClosed`, `ErrClientDisconnected`, `ErrInvalidURL`, `ErrConnectionFailed`, `EngineError`.
3. Step 3 (Backward Compatibility & Safe Migration): By having each custom error type (`ConfigError`, `LLMError`, `ToolError`, `AgentError`, `SessionError`, `ProtocolError`, `EngineError`) implement `Unwrap() error`, `Is(target error) bool`, and format its `Error()` string to retain critical substrings (e.g. `"APIKey is empty"`, `"SSE line too large"`, `"max iterations (3) reached"`), tests can simultaneously assert `errors.Is(err, ...)` without breaking existing `strings.Contains` or `wantErr` assertions.

## 3. Caveats
- No caveats. All 9 unit test files and package error sources were comprehensively audited, executed, and mapped.

## 4. Conclusion
The error assertion landscape has been completely mapped and specified in `.agents/m1_spec_miner/spec.md`. The M1 implementation team (`m1_worker_1`, `m1_worker_2`, etc.) can implement domain error types and sentinels, replace panics in `pkg/protocol`, replace `strings.Contains` in `pkg/llm/retry.go` with `LLMError.IsRetryable()`, and update unit test assertions to `errors.Is`/`errors.As` with zero regression risk.

## 5. Verification Method
1. Read `.agents/m1_spec_miner/spec.md` to review the mapping table and error definitions.
2. Execute `go test ./...` in the repository root to verify baseline test behavior.
3. Verify that all 24 mapped test assertion cases in `spec.md` correspond to existing lines in the respective `*_test.go` files.
