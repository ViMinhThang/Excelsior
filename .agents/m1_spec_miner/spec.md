# Milestone 1 Specification: Domain Error Hierarchy & Test Assertion Mapping

## Executive Summary
This specification documents the complete audit of error checking and assertion patterns across all existing unit test files in the Excelsior codebase (`pkg/config`, `pkg/llm`, `pkg/tools`, `pkg/agent`, `pkg/session`, `pkg/protocol`, `pkg/engine`). It establishes an authoritative mapping from ad-hoc string comparisons (`strings.Contains(err.Error(), "...")`) and unspecific boolean checks (`err != nil`) to typed domain sentinel errors (`errors.Is`) and structured error types (`errors.As`), ensuring complete backward compatibility while fulfilling the Milestone 1 requirements.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Configuration | Config Validation & Parsing | Validate required fields (`APIKey`, `Model`, `BaseURL`, `Temperature`) in `Config.Validate()` | `Config` struct | `nil` or `ConfigError` | Returns typed sentinels: `ErrMissingAPIKey`, `ErrMissingModel`, `ErrInvalidBaseURL`, `ErrInvalidTemperature` | `pkg/config/config.go:57-75`, `config_test.go:36-55` |
| 2 | Configuration | Workspace Resolution | Resolves and validates absolute workspace directory in `ResolveWorkspace` | `flagWS`, `cfgWS` strings | `string` (abs path), `error` | Returns `ErrInvalidWorkspace`, `ErrWorkspaceNotFound`, `ErrWorkspaceNotDir` wrapping `os.ErrNotExist` | `pkg/config/config.go:78-103` |
| 3 | LLM Transport | SSE Stream Parsing | Parses streaming server-sent events from DeepSeek `/chat/completions` | `io.Reader`, `onDelta` callback | `*Message`, `error` | Returns `ErrLineTooLarge` on buffer overflow (1 MiB), `ErrStreamInterrupted` on read error, `context.Canceled` | `pkg/llm/sse.go:23-145`, `llm_test.go:119-136` |
| 4 | LLM Transport | Client Validation | Validates API key and BaseURL before initiating HTTP requests | `Client` struct, `ChatRequest` | `*Message`, `error` | Returns `ErrMissingAPIKey`, `ErrInvalidBaseURL` wrapped in `*LLMError` | `pkg/llm/client.go:49-58`, `deepseek_test.go:74-79` |
| 5 | LLM Transport | Typed Retry Predicate | Evaluates retry eligibility for HTTP status codes and transport errors | `status` int, `err` error | `bool` (retryable), `time.Duration` | Evaluates `LLMError.IsRetryable()` natively without fragile `strings.Contains` | `pkg/llm/retry.go:18-74`, `llm_test.go:65-101` |
| 6 | Tools Subsystem | Path Jail & Security | Jails relative paths within workspace root, rejecting traversal and escapes | `root`, `p` strings | `fullPath` string, `error` | Returns `ErrEmptyPath`, `ErrAbsolutePath`, `ErrPathOutsideWorkspace` | `pkg/tools/secure.go:11-38`, `tools_test.go:27-48` |
| 7 | Tools Subsystem | Tool Argument Validation | Validates parameters for `view`, `write`, `edit`, `bash`, `glob`, `grep`, `ask` | JSON arguments | `string` output, `error` | Returns `ErrInvalidArguments`, `ErrEmptyPattern`, `ErrFileTooLarge`, `ErrCommandTooLong` wrapped in `*ToolError` | `pkg/tools/*.go`, `tools_test.go:78-260` |
| 8 | Tools Subsystem | Edit String Replacement | Exact unique string match and replacement in target file | `filePath`, `oldText`, `newText` | `string` output, `error` | Returns `ErrOldTextNotFound`, `ErrOldTextAmbiguous`, `ErrFileTooLarge` wrapped in `*ToolError` | `pkg/tools/edit.go:29-79`, `tools_test.go:176-186` |
| 9 | Agent Loop | Execution Iteration Cap | Terminates tool loop when reaching maximum configured iterations | `Agent` configuration, `RunOptions` | `*RunResult`, `error` | Returns `ErrMaxIterationsReached` wrapped in `*AgentError` | `pkg/agent/agent.go:136-205`, `agent_test.go:316-349` |
| 10| Agent Loop | Context Size Guard | Rejects prompts exceeding character threshold (600,000 chars) | Input `[]llm.Message` | `nil`, `error` | Returns `ErrContextTooLarge` wrapped in `*AgentError` | `pkg/agent/agent.go:144-145`, `agent_test.go:397-409` |
| 11| Agent Loop | Agent Config Validation | Validates LLM provider, MaxIters, and non-empty initial messages | `Agent` fields, `RunOptions` | `nil`, `error` | Returns `ErrLLMNotConfigured`, `ErrInvalidMaxIterations`, `ErrEmptyMessages` | `pkg/agent/agent.go:81-89`, `agent_test.go:453-471` |
| 12| Agent Loop | Tool Error Resilience | Converts tool execution failures into conversational feedback | Tool `Execute` error | Tool role message `error: <msg>` | Converts internal tool error into `llm.Message{Role: "tool", Content: "error: ..."}` without halting agent | `pkg/agent/agent.go:225-237`, `agent_test.go:235-277` |
| 13| Agent Loop | Unknown Tool Fallback | Handles model requesting nonexistent tools | Model tool call name | Tool role message `error: unknown tool "<name>"` | Emits error string in tool result and continues iteration loop | `pkg/agent/agent.go:227-230`, `agent_test.go:279-314` |
| 14| Session Store | Session ID Validation | Sanitizes session IDs preventing path traversal or invalid characters | `id` string | `string` (sanitized), `error` | Returns `ErrEmptySessionID`, `ErrInvalidSessionID` wrapped in `*SessionError` | `pkg/session/session.go:39-51`, `session_test.go:110-121` |
| 15| Session Store | Corrupt Line Recovery | Tolerates trailing corrupt lines in session JSONL files | Corrupted `.jsonl` file | `*Record`, `error` | Recovers last valid record; returns `ErrCorruptedSession` if no valid line found | `pkg/session/session.go:120-155`, `session_test.go:123-147` |
| 16| Wire Protocol | Safe Envelope Marshaling | Marshals payload into `json.RawMessage` without panicking | Any serializable payload `v` | `json.RawMessage`, `error` | Returns `ErrMarshalFailed` wrapped in `*ProtocolError`; eliminates `panic(err)` | `pkg/protocol/protocol.go:29-38`, `protocol_test.go:187-213` |
| 17| Wire Protocol | Envelope Decoding | Decodes payload JSON into destination struct | `Envelope`, target pointer `v` | `error` | Returns `ErrUnmarshalFailed` wrapped in `*ProtocolError` | `pkg/protocol/protocol.go:21-26` |
| 18| Engine Hub | Connection State Tracking | Guards concurrent chat streaming requests per connection | Incoming `chat.req` envelope | `TypeError` envelope or stream | Returns `ErrAlreadyStreaming` wrapped in `*EngineError` | `pkg/engine/conn.go:150-163` |
| 19| Engine Client | Remote Stream Client | Connects to remote WebSocket engine and proxies events | `WSClient`, `ChatReq` | Streaming callbacks, `error` | Returns `ErrInvalidURL`, `ErrConnectionFailed`, or wraps remote engine `TypeError` | `pkg/engine/client.go:34-127` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | `config.Validate` | `APIKey: ""` | Returns error with text `"DEEPSEEK_API_KEY is required"`. Must match `errors.Is(err, ErrMissingAPIKey)`. |
| 2 | `config.Validate` | `BaseURL: "://bad"` | Returns parse error `"invalid BaseURL ...: missing protocol scheme"`. Must match `errors.Is(err, ErrInvalidBaseURL)`. |
| 3 | `config.Validate` | `Temperature: 5` | Returns out-of-range error `"temperature must be 0..2, got 5"`. Must match `errors.Is(err, ErrInvalidTemperature)`. |
| 4 | `config.Validate` | `Model: ""` | Returns `"model is required"`. Must match `errors.Is(err, ErrMissingModel)`. |
| 5 | `llm.StreamChat` | `APIKey: ""` | Returns error containing `"APIKey"`. Must match `errors.Is(err, ErrMissingAPIKey)`. |
| 6 | `llm.parseSSEStream` | Single line > 1 MiB | Returns error containing `"SSE line too large"`. Must match `errors.Is(err, ErrLineTooLarge)`. |
| 7 | `llm.isRetryable` | `context.Canceled` | Returns `false` (cancellations must never be retried). |
| 8 | `llm.isRetryable` | `context.DeadlineExceeded` | Returns `true` (timeouts are transient and eligible for retry). |
| 9 | `llm.isRetryable` | `errors.New("connection reset")` | Returns `true` (generic I/O network errors are retryable). |
| 10| `tools.secureJoin` | Path `../escape` | Returns `"path outside workspace"`. Must match `errors.Is(err, ErrPathOutsideWorkspace)`. |
| 11| `tools.secureJoin` | Path `/etc/passwd` or `C:\Windows` | Returns `"absolute paths not allowed"`. Must match `errors.Is(err, ErrAbsolutePath)`. |
| 12| `tools.secureJoin` | Empty path `""` | Returns `"path is empty"`. Must match `errors.Is(err, ErrEmptyPath)`. |
| 13| `tools.ViewTool` | `limit: 999` (> 200) | Returns `"view: limit must be 1..200"`. Must match `errors.Is(err, ErrInvalidArguments)`. |
| 14| `tools.EditTool` | `oldText: ""` | Returns `"edit: oldText must be non-empty"`. Must match `errors.Is(err, ErrInvalidArguments)`. |
| 15| `tools.EditTool` | `oldText` not in file | Returns `"edit: oldText not found"`. Must match `errors.Is(err, ErrOldTextNotFound)`. |
| 16| `tools.EditTool` | `oldText` matched multiple times | Returns `"edit: oldText matched %d times, must be unique"`. Must match `errors.Is(err, ErrOldTextAmbiguous)`. |
| 17| `tools.BashTool` | `command: ""` | Returns `"bash: command is required"`. Must match `errors.Is(err, ErrInvalidArguments)`. |
| 18| `tools.BashTool` | `timeout: 999999` (> 120000) | Returns `"bash: timeout must be 1000..120000 ms"`. Must match `errors.Is(err, ErrInvalidArguments)`. |
| 19| `agent.Run` | `Agent{LLM: nil}` | Returns `"agent: LLM not configured"`. Must match `errors.Is(err, ErrLLMNotConfigured)`. |
| 20| `agent.Run` | `MaxIters: -1` | Returns `"agent: MaxIters must be >=0"`. Must match `errors.Is(err, ErrInvalidMaxIterations)`. |
| 21| `agent.Run` | `Messages: nil` | Returns `"agent: Messages is empty"`. Must match `errors.Is(err, ErrEmptyMessages)`. |
| 22| `agent.Run` | Total chars > 600,000 | Returns `"agent: context too large"`. Must match `errors.Is(err, ErrContextTooLarge)`. |
| 23| `agent.Run` | Loop exceeding max iterations | Returns `"agent: max iterations (3) reached"`. Must match `errors.Is(err, ErrMaxIterationsReached)`. |
| 24| `agent.Run` | Already canceled context | Returns `"context canceled"`. Must match `errors.Is(err, context.Canceled)`. |
| 25| `session.Save` | `id: "../escape"` or `"bad/id"` | Returns `"invalid session id ...: must not contain path separators"`. Must match `errors.Is(err, ErrInvalidSessionID)`. |
| 26| `session.Save` | `id: ""` | Returns `"session id is empty"`. Must match `errors.Is(err, ErrEmptySessionID)`. |
| 27| `session.Load` | Multi-line JSONL with corrupted line | Recovers last valid JSON line and returns messages without error. |
| 28| `session.Load` | Non-existent session ID | Returns load error wrapping `os.ErrNotExist`. Must match `errors.Is(err, ErrSessionNotFound)`. |
| 29| `protocol.MustMarshalPayload` | Channel or cyclic pointer | Currently panics. M1 safe `MarshalPayload` returns error matching `errors.Is(err, ErrMarshalFailed)`. |

---

## Detailed Test-by-Test Assertion Mapping

This table maps **every single error assertion** currently present across the 9 unit test files in `pkg/` to the corresponding typed domain error assertions for Milestone 1.

| # | Test File & Line | Test Function / Case | Current Error Assertion | Current Error Text | Target Sentinel / Structured Error | Proposed M1 Assertion (`errors.Is` / `errors.As`) | Compatibility Guarantee |
|---|------------------|----------------------|-------------------------|-------------------|-----------------------------------|---------------------------------------------------|-------------------------|
| 1 | `pkg/config/config_test.go:44` | `TestValidate` ("no key") | `(err != nil) != tc.wantErr` | `"DEEPSEEK_API_KEY is required"` | `config.ErrMissingAPIKey`, `*config.ConfigError{Field: "APIKey"}` | `if !errors.Is(err, config.ErrMissingAPIKey) { t.Fatalf(...) }` | `ConfigError.Error()` outputs `"DEEPSEEK_API_KEY is required"`; `(err != nil) == true` remains valid. |
| 2 | `pkg/config/config_test.go:45` | `TestValidate` ("bad url") | `(err != nil) != tc.wantErr` | `"invalid BaseURL \"://bad\": ..."` | `config.ErrInvalidBaseURL`, `*config.ConfigError{Field: "BaseURL"}` | `if !errors.Is(err, config.ErrInvalidBaseURL) { t.Fatalf(...) }` | `ConfigError.Error()` outputs formatted BaseURL error; `wantErr` table test passes. |
| 3 | `pkg/config/config_test.go:46` | `TestValidate` ("bad temp") | `(err != nil) != tc.wantErr` | `"temperature must be 0..2, got 5"` | `config.ErrInvalidTemperature`, `*config.ConfigError{Field: "Temperature"}` | `if !errors.Is(err, config.ErrInvalidTemperature) { t.Fatalf(...) }` | `ConfigError.Error()` outputs `"temperature must be 0..2, got 5"`; `wantErr` passes. |
| 4 | `pkg/llm/deepseek_test.go:76` | `TestClient_Validate` | `err == nil \|\| !strings.Contains(err.Error(), "APIKey")` | `"deepseek: APIKey is empty (set DEEPSEEK_API_KEY)"` | `llm.ErrMissingAPIKey`, `*llm.LLMError` | `if !errors.Is(err, llm.ErrMissingAPIKey) { t.Fatalf("expected ErrMissingAPIKey, got %v", err) }` | `LLMError.Error()` retains `"APIKey is empty"` substring; both `strings.Contains` and `errors.Is` pass. |
| 5 | `pkg/llm/llm_test.go:93` | `TestRetryPolicy_IsRetryable` (context canceled) | `isRetryable(0, context.Canceled)` | N/A (boolean return) | `context.Canceled` | `if isRetryable(0, context.Canceled) { t.Error("context.Canceled should not be retryable") }` and `(&LLMError{Err: context.Canceled}).IsRetryable() == false` | Pure boolean check preserved; typed method added. |
| 6 | `pkg/llm/llm_test.go:98` | `TestRetryPolicy_IsRetryable` (network error) | `!isRetryable(0, errors.New("connection reset by peer"))` | N/A (boolean return) | Generic network error / `ErrServerUnavailable` | `if !isRetryable(0, err) { t.Error("generic network error should be retryable") }` | Preserved. |
| 7 | `pkg/llm/llm_test.go:133` | `TestSSE_LineTooLarge` | `!strings.Contains(err.Error(), "SSE line too large")` | `"deepseek: SSE line too large (1048586 > 1048576)"` | `llm.ErrLineTooLarge`, `*llm.LLMError` | `if !errors.Is(err, llm.ErrLineTooLarge) { t.Errorf("expected ErrLineTooLarge, got %v", err) }` | `LLMError.Error()` contains `"SSE line too large"`; legacy string check and `errors.Is` both succeed. |
| 8 | `pkg/tools/tools_test.go:44` | `TestSecureJoin` ("../escape", etc.) | `(err != nil) != tc.wantErr` | `"path outside workspace: ../escape"` / `"absolute paths not allowed"` | `tools.ErrPathOutsideWorkspace`, `tools.ErrAbsolutePath`, `tools.ErrEmptyPath` | `if tc.wantErr && !errors.Is(err, tools.ErrPathOutsideWorkspace) && !errors.Is(err, tools.ErrAbsolutePath) && !errors.Is(err, tools.ErrEmptyPath) { t.Errorf(...) }` | `ToolError` wraps sentinel; `wantErr` check remains 100% compliant. |
| 9 | `pkg/tools/tools_test.go:92` | `TestGlobTool` (traversal) | `err == nil` | `"glob: pattern outside workspace"` | `tools.ErrPathOutsideWorkspace`, `*tools.ToolError` | `if !errors.Is(err, tools.ErrPathOutsideWorkspace) { t.Errorf("expected ErrPathOutsideWorkspace, got %v", err) }` | `err != nil` condition satisfied. |
| 10| `pkg/tools/tools_test.go:131` | `TestViewTool` (limit > 200) | `err == nil` | `"view: limit must be 1..200, got 999"` | `tools.ErrInvalidArguments`, `*tools.ToolError` | `if !errors.Is(err, tools.ErrInvalidArguments) { t.Errorf("expected ErrInvalidArguments, got %v", err) }` | `err != nil` condition satisfied. |
| 11| `pkg/tools/tools_test.go:141` | `TestViewTool` (traversal) | `err == nil` | `"view: path outside workspace: ../escape"` | `tools.ErrPathOutsideWorkspace`, `*tools.ToolError` | `if !errors.Is(err, tools.ErrPathOutsideWorkspace) { t.Errorf("expected ErrPathOutsideWorkspace, got %v", err) }` | `err != nil` condition satisfied. |
| 12| `pkg/tools/tools_test.go:183` | `TestWriteAndEditTool` (empty oldText) | `err == nil` | `"edit: oldText must be non-empty"` | `tools.ErrInvalidArguments`, `*tools.ToolError` | `if !errors.Is(err, tools.ErrInvalidArguments) { t.Errorf("expected ErrInvalidArguments, got %v", err) }` | `err != nil` condition satisfied. |
| 13| `pkg/tools/tools_test.go:192` | `TestBashTool_Validation` (empty cmd) | `err == nil` | `"bash: command is required"` | `tools.ErrInvalidArguments`, `*tools.ToolError` | `if !errors.Is(err, tools.ErrInvalidArguments) { t.Errorf("expected ErrInvalidArguments, got %v", err) }` | `err != nil` condition satisfied. |
| 14| `pkg/tools/tools_test.go:196` | `TestBashTool_Validation` (bad timeout) | `err == nil` | `"bash: timeout must be 1000..120000 ms, got 999999"` | `tools.ErrInvalidArguments`, `*tools.ToolError` | `if !errors.Is(err, tools.ErrInvalidArguments) { t.Errorf("expected ErrInvalidArguments, got %v", err) }` | `err != nil` condition satisfied. |
| 15| `pkg/tools/tools_test.go:214` | `TestGrepTool` (empty pattern) | `err == nil` | `"grep: pattern is required"` | `tools.ErrInvalidArguments`, `*tools.ToolError` | `if !errors.Is(err, tools.ErrInvalidArguments) { t.Errorf("expected ErrInvalidArguments, got %v", err) }` | `err != nil` condition satisfied. |
| 16| `pkg/agent/agent_test.go:346` | `TestAgent_MaxIterationsCap` | `err == nil \|\| !strings.Contains(err.Error(), "max iterations (3) reached")` | `"agent: max iterations (3) reached"` | `agent.ErrMaxIterationsReached`, `*agent.AgentError` | `if !errors.Is(err, agent.ErrMaxIterationsReached) { t.Fatalf("expected ErrMaxIterationsReached, got %v", err) }` | `AgentError.Error()` retains `"max iterations (3) reached"`; both pass. |
| 17| `pkg/agent/agent_test.go:362` | `TestAgent_ContextCancellationBeforeRun` | `err == nil` | `"agent: context canceled before iter 0: context canceled"` | `context.Canceled`, `*agent.AgentError` | `if !errors.Is(err, context.Canceled) { t.Fatalf("expected context.Canceled, got %v", err) }` | `AgentError.Unwrap()` returns `context.Canceled`. |
| 18| `pkg/agent/agent_test.go:406` | `TestAgent_ContextTooLargeGuard` | `err == nil \|\| !strings.Contains(err.Error(), "context too large")` | `"agent: context too large (700000 chars > 600000)"` | `agent.ErrContextTooLarge`, `*agent.AgentError` | `if !errors.Is(err, agent.ErrContextTooLarge) { t.Fatalf("expected ErrContextTooLarge, got %v", err) }` | `AgentError.Error()` retains `"context too large"`; both pass. |
| 19| `pkg/agent/agent_test.go:456` | `TestAgent_ValidationErrors` (nil LLM) | `err == nil` | `"agent: LLM not configured"` | `agent.ErrLLMNotConfigured`, `*agent.AgentError` | `if !errors.Is(err, agent.ErrLLMNotConfigured) { t.Errorf("expected ErrLLMNotConfigured, got %v", err) }` | `err != nil` satisfied. |
| 20| `pkg/agent/agent_test.go:461` | `TestAgent_ValidationErrors` (negative iters) | `err == nil` | `"agent: MaxIters must be >=0, got -1"` | `agent.ErrInvalidMaxIterations`, `*agent.AgentError` | `if !errors.Is(err, agent.ErrInvalidMaxIterations) { t.Errorf("expected ErrInvalidMaxIterations, got %v", err) }` | `err != nil` satisfied. |
| 21| `pkg/agent/agent_test.go:467` | `TestAgent_ValidationErrors` (empty msgs) | `err == nil` | `"agent: Messages is empty"` | `agent.ErrEmptyMessages`, `*agent.AgentError` | `if !errors.Is(err, agent.ErrEmptyMessages) { t.Errorf("expected ErrEmptyMessages, got %v", err) }` | `err != nil` satisfied. |
| 22| `pkg/session/session_test.go:112` | `TestStore_SanitizeID` ("../escape") | `err == nil` | `"invalid session id \"../escape\": must not contain path separators"` | `session.ErrInvalidSessionID`, `*session.SessionError` | `if !errors.Is(err, session.ErrInvalidSessionID) { t.Errorf("expected ErrInvalidSessionID, got %v", err) }` | `err != nil` satisfied. |
| 23| `pkg/session/session_test.go:115` | `TestStore_SanitizeID` ("bad/id") | `err == nil` | `"invalid session id \"bad/id\": must not contain path separators"` | `session.ErrInvalidSessionID`, `*session.SessionError` | `if !errors.Is(err, session.ErrInvalidSessionID) { t.Errorf("expected ErrInvalidSessionID, got %v", err) }` | `err != nil` satisfied. |
| 24| `pkg/session/session_test.go:118` | `TestStore_SanitizeID` ("") | `err == nil` | `"session id is empty"` | `session.ErrEmptySessionID`, `session.ErrInvalidSessionID` | `if !errors.Is(err, session.ErrEmptySessionID) { t.Errorf("expected ErrEmptySessionID, got %v", err) }` | `err != nil` satisfied. |

---

## Domain Error Type Hierarchy Specifications

### 1. `pkg/config`
```go
package config

import "errors"

// Sentinel errors
var (
    ErrMissingAPIKey      = errors.New("DEEPSEEK_API_KEY is required")
    ErrMissingModel       = errors.New("model is required")
    ErrInvalidBaseURL     = errors.New("invalid BaseURL")
    ErrInvalidTemperature = errors.New("temperature must be between 0.0 and 2.0")
    ErrInvalidWorkspace   = errors.New("invalid workspace path")
    ErrWorkspaceNotFound  = errors.New("workspace directory not found")
    ErrWorkspaceNotDir    = errors.New("workspace path is not a directory")
)

// ConfigError represents a configuration validation or resolution failure.
type ConfigError struct {
    Field string
    Msg   string
    Err   error
}

func (e *ConfigError) Error() string {
    if e.Msg != "" {
        return e.Msg
    }
    if e.Err != nil {
        return e.Err.Error()
    }
    return "invalid configuration"
}

func (e *ConfigError) Unwrap() error { return e.Err }

func (e *ConfigError) Is(target error) bool {
    if target == nil {
        return false
    }
    return errors.Is(e.Err, target)
}
```

### 2. `pkg/llm`
```go
package llm

import "errors"

// Sentinel errors
var (
    ErrMissingAPIKey     = errors.New("deepseek: APIKey is empty (set DEEPSEEK_API_KEY)")
    ErrAuthFailed        = errors.New("deepseek: authentication failed (401/403)")
    ErrRateLimit         = errors.New("deepseek: rate limit exceeded (429)")
    ErrServerUnavailable = errors.New("deepseek: server unavailable (5xx)")
    ErrInvalidRequest    = errors.New("deepseek: invalid request (400)")
    ErrStreamInterrupted = errors.New("deepseek: stream interrupted")
    ErrLineTooLarge      = errors.New("deepseek: SSE line too large")
)

// LLMError is a structured error for LLM provider operations.
type LLMError struct {
    StatusCode int
    Body       string
    Err        error
}

func (e *LLMError) Error() string {
    if e.Body != "" {
        return fmt.Sprintf("deepseek: %d %s", e.StatusCode, e.Body)
    }
    if e.Err != nil {
        return fmt.Sprintf("deepseek: %d: %v", e.StatusCode, e.Err)
    }
    return fmt.Sprintf("deepseek: %d", e.StatusCode)
}

func (e *LLMError) Unwrap() error { return e.Err }

func (e *LLMError) Is(target error) bool {
    if target == nil {
        return false
    }
    switch target {
    case ErrMissingAPIKey:
        return errors.Is(e.Err, ErrMissingAPIKey)
    case ErrLineTooLarge:
        return errors.Is(e.Err, ErrLineTooLarge)
    case ErrRateLimit:
        return e.StatusCode == 429 || errors.Is(e.Err, ErrRateLimit)
    case ErrAuthFailed:
        return e.StatusCode == 401 || e.StatusCode == 403 || errors.Is(e.Err, ErrAuthFailed)
    case ErrServerUnavailable:
        return e.StatusCode >= 500 && e.StatusCode <= 599
    case ErrInvalidRequest:
        return e.StatusCode == 400 || errors.Is(e.Err, ErrInvalidRequest)
    default:
        return errors.Is(e.Err, target)
    }
}

// IsRetryable reports whether the failure is transient and eligible for retry.
func (e *LLMError) IsRetryable() bool {
    if errors.Is(e.Err, context.Canceled) {
        return false
    }
    if errors.Is(e.Err, ErrMissingAPIKey) || errors.Is(e.Err, ErrLineTooLarge) || errors.Is(e.Err, ErrInvalidRequest) || errors.Is(e.Err, ErrAuthFailed) {
        return false
    }
    if errors.Is(e.Err, context.DeadlineExceeded) || errors.Is(e.Err, ErrRateLimit) || errors.Is(e.Err, ErrServerUnavailable) || errors.Is(e.Err, ErrStreamInterrupted) {
        return true
    }
    switch e.StatusCode {
    case 429, 500, 502, 503, 504:
        return true
    case 400, 401, 403, 404:
        return false
    }
    // Generic network/transport errors are retryable
    return e.Err != nil
}
```

### 3. `pkg/tools`
```go
package tools

import "errors"

// Sentinel errors
var (
    ErrEmptyPath             = errors.New("path is empty")
    ErrAbsolutePath          = errors.New("absolute paths not allowed")
    ErrPathOutsideWorkspace  = errors.New("path outside workspace")
    ErrInvalidArguments      = errors.New("invalid tool arguments")
    ErrFileTooLarge          = errors.New("file too large")
    ErrCommandTooLong        = errors.New("command too long")
    ErrOldTextNotFound       = errors.New("oldText not found")
    ErrOldTextAmbiguous      = errors.New("oldText matched multiple times")
    ErrToolNotFound          = errors.New("tool not found")
)

// ToolError is a structured error for tool executions.
type ToolError struct {
    Tool string
    Op   string
    Msg  string
    Err  error
}

func (e *ToolError) Error() string {
    if e.Msg != "" {
        return fmt.Sprintf("%s: %s", e.Tool, e.Msg)
    }
    if e.Err != nil {
        return fmt.Sprintf("%s: %v", e.Tool, e.Err)
    }
    return fmt.Sprintf("%s: execution error", e.Tool)
}

func (e *ToolError) Unwrap() error { return e.Err }

func (e *ToolError) Is(target error) bool {
    if target == nil {
        return false
    }
    return errors.Is(e.Err, target)
}
```

### 4. `pkg/agent`
```go
package agent

import "errors"

// Sentinel errors
var (
    ErrMaxIterationsReached = errors.New("max iterations reached")
    ErrContextTooLarge      = errors.New("context too large")
    ErrEmptyMessages        = errors.New("Messages is empty")
    ErrLLMNotConfigured     = errors.New("LLM not configured")
    ErrInvalidMaxIterations = errors.New("MaxIters must be >=0")
    ErrUnknownTool          = errors.New("unknown tool")
)

// AgentError is a structured error for the ReAct loop.
type AgentError struct {
    Iter int
    Msg  string
    Err  error
}

func (e *AgentError) Error() string {
    if e.Msg != "" {
        return fmt.Sprintf("agent: %s", e.Msg)
    }
    if e.Err != nil {
        return fmt.Sprintf("agent: %v", e.Err)
    }
    return "agent: execution error"
}

func (e *AgentError) Unwrap() error { return e.Err }

func (e *AgentError) Is(target error) bool {
    if target == nil {
        return false
    }
    return errors.Is(e.Err, target)
}
```

### 5. `pkg/session`
```go
package session

import "errors"

// Sentinel errors
var (
    ErrEmptySessionID   = errors.New("session id is empty")
    ErrInvalidSessionID = errors.New("invalid session id")
    ErrSessionNotFound  = errors.New("session not found")
    ErrCorruptedSession = errors.New("session file corrupted")
    ErrEmptySession     = errors.New("session is empty")
    ErrEmptyStoreDir    = errors.New("session store dir is empty")
)

// SessionError is a structured error for session store operations.
type SessionError struct {
    ID  string
    Op  string
    Msg string
    Err error
}

func (e *SessionError) Error() string {
    if e.Msg != "" {
        return fmt.Sprintf("session %s: %s", e.Op, e.Msg)
    }
    if e.Err != nil {
        return fmt.Sprintf("session %s: %v", e.Op, e.Err)
    }
    return fmt.Sprintf("session: %s error", e.Op)
}

func (e *SessionError) Unwrap() error { return e.Err }

func (e *SessionError) Is(target error) bool {
    if target == nil {
        return false
    }
    return errors.Is(e.Err, target)
}
```

### 6. `pkg/protocol`
```go
package protocol

import "errors"

// Sentinel errors
var (
    ErrMarshalFailed      = errors.New("protocol: marshal payload failed")
    ErrUnmarshalFailed    = errors.New("protocol: unmarshal payload failed")
    ErrUnsupportedVersion = errors.New("protocol: unsupported version")
    ErrUnknownType        = errors.New("protocol: unknown message type")
    ErrInvalidPayload     = errors.New("protocol: invalid payload")
)

// ProtocolError is a structured error for protocol serialization and validation.
type ProtocolError struct {
    Type string
    Msg  string
    Err  error
}

func (e *ProtocolError) Error() string {
    if e.Msg != "" {
        return fmt.Sprintf("protocol: %s", e.Msg)
    }
    if e.Err != nil {
        return fmt.Sprintf("protocol: %v", e.Err)
    }
    return "protocol error"
}

func (e *ProtocolError) Unwrap() error { return e.Err }

func (e *ProtocolError) Is(target error) bool {
    if target == nil {
        return false
    }
    return errors.Is(e.Err, target)
}
```

### 7. `pkg/engine`
```go
package engine

import "errors"

// Sentinel errors
var (
    ErrAlreadyStreaming   = errors.New("already streaming, wait for done")
    ErrConnectionClosed   = errors.New("connection closed")
    ErrClientDisconnected = errors.New("client disconnected")
    ErrInvalidURL         = errors.New("invalid engine url")
    ErrConnectionFailed   = errors.New("failed to connect to engine")
)

// EngineError is a structured error for engine server and client operations.
type EngineError struct {
    Op  string
    Msg string
    Err error
}

func (e *EngineError) Error() string {
    if e.Msg != "" {
        return fmt.Sprintf("engine %s: %s", e.Op, e.Msg)
    }
    if e.Err != nil {
        return fmt.Sprintf("engine %s: %v", e.Op, e.Err)
    }
    return fmt.Sprintf("engine: %s error", e.Op)
}

func (e *EngineError) Unwrap() error { return e.Err }

func (e *EngineError) Is(target error) bool {
    if target == nil {
        return false
    }
    return errors.Is(e.Err, target)
}
```

---

## Verification & Migration Checklist for Implementers

1. **Keep String Output Identical or Compatible**: Every custom `Error()` method must format error messages such that `strings.Contains(err.Error(), ...)` tests pass without modification if run against new implementations.
2. **Support Standard Unwrap Chains**: All custom errors implement `Unwrap() error` and `Is(target error) bool` delegation so `errors.Is` and `errors.As` operate smoothly across multiple wrapping layers (`fmt.Errorf("...: %w", err)`).
3. **Migrate Tests Incrementally**:
   - Update `config_test.go` to assert `errors.Is(err, config.ErrMissingAPIKey)` alongside `wantErr == true`.
   - Update `deepseek_test.go` to assert `errors.Is(err, llm.ErrMissingAPIKey)`.
   - Update `llm_test.go` to assert `errors.Is(err, llm.ErrLineTooLarge)`.
   - Update `agent_test.go` to assert `errors.Is(err, agent.ErrMaxIterationsReached)` and `errors.Is(err, agent.ErrContextTooLarge)`.
   - Update `tools_test.go` to assert `errors.Is(err, tools.ErrPathOutsideWorkspace)` and `errors.Is(err, tools.ErrInvalidArguments)`.
   - Update `session_test.go` to assert `errors.Is(err, session.ErrInvalidSessionID)` and `errors.Is(err, session.ErrEmptySessionID)`.
4. **Zero-Regression Guarantee**: Running `go test ./...` must pass both with original test assertions and after augmenting tests with `errors.Is`/`errors.As`.
