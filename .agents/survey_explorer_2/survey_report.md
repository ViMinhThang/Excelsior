# Survey Report: Error Handling, Type Safety, and Panic Risks in Excelsior

**Explorer**: survey_explorer_2  
**Date**: 2026-08-29  
**Repository**: `c:\Users\huynh\OneDrive\Desktop\projects\excelsior`  
**Focus Area**: Survey of Error Handling Patterns, Type Safety, Panic Risks, Domain Error Hierarchy Specification, and R2 Refactoring Roadmap.

---

## Executive Summary

A comprehensive, file-by-file audit of the Excelsior Go codebase (`pkg/agent`, `pkg/llm`, `pkg/tools`, `pkg/config`, `pkg/session`, `pkg/protocol`, `pkg/engine`, `pkg/tui`, `pkg/util`, and `cmd/excelsior`) revealed that while the system has a clean architectural blueprint and strong foundation, its error handling and type safety are currently dominated by **ad-hoc string formatting, missing domain error hierarchies, fragile string-based error classification, and latent panic / nil-pointer dereference vulnerabilities**.

### Key Survey Metrics
- **Total Go Source Files Inspected**: 24 production files, 8 test files across 10 directories.
- **Explicit Panics**: 1 identified (`pkg/protocol/protocol.go:35`).
- **Latent Panic / Nil Dereference Sites**: 4 critical sites (`pkg/tools/grep.go:53`, `pkg/engine/client.go:109`, `pkg/agent/agent.go:190`, `pkg/llm/client.go:55` & `pkg/config/config.go:66`).
- **Unchecked Type Assertions**: 2 sites in tests (`pkg/llm/deepseek_test.go:28`, `pkg/llm/llm_test.go:24`).
- **Domain Sentinel Errors Defined**: 0 sentinels across the entire codebase.
- **Domain Error Types Defined**: 1 (`LLMError` in `pkg/llm/retry.go`), used only for non-200 HTTP response codes.
- **`errors.Is` Usage**: Only 5 sites in production code (`os.ErrNotExist`, `http.ErrServerClosed`, `context.Canceled`, `context.DeadlineExceeded`, `filepath.SkipAll`).
- **`errors.As` Usage**: Only 2 sites in production code (both querying `*LLMError`).
- **Ad-Hoc String Matching for Control Flow**: 1 critical site in `pkg/llm/retry.go:62-64` (`strings.Contains(msg, "marshal")`).
- **Tests Relying on String Substring Matching**: 100% of error-asserting unit tests.

---

## 1. Comprehensive Catalog of Error Creation & Wrapping Patterns

### 1.1 Ad-Hoc `errors.New` Invocations
Currently, 15+ error creation sites use bare `errors.New` without domain error types or sentinel variables, making programmatic error handling impossible:

| Package | File & Line | Code Snippet | Issue / Impact |
|---|---|---|---|
| `pkg/config` | `config.go:59` | `errors.New("DEEPSEEK_API_KEY is required")` | Unchecked string; cannot test with `errors.Is(err, config.ErrMissingAPIKey)` |
| `pkg/config` | `config.go:62` | `errors.New("model is required")` | Unchecked string; cannot test with `errors.Is(err, config.ErrMissingModel)` |
| `pkg/llm` | `client.go:51` | `errors.New("deepseek: APIKey is empty (set DEEPSEEK_API_KEY)")` | Inconsistent prefix `deepseek:`; untyped |
| `pkg/agent` | `agent.go:83` | `errors.New("agent: LLM not configured")` | Cannot distinguish configuration error from runtime error |
| `pkg/agent` | `agent.go:141` | `errors.New("agent: Messages is empty")` | Untyped input validation error |
| `pkg/session` | `session.go:42` | `errors.New("session id is empty")` | Untyped session validation error |
| `pkg/session` | `session.go:59` | `errors.New("session store dir is empty")` | Untyped session configuration error |
| `pkg/tools` | `secure.go:13` | `errors.New("path is empty")` | Untyped path security validation error |
| `pkg/tools` | `view.go:40` | `errors.New("view: filePath is required")` | Untyped argument validation error |
| `pkg/tools` | `write.go:38` | `errors.New("write: filePath is required")` | Untyped argument validation error |
| `pkg/tools` | `edit.go:43` | `errors.New("edit: filePath is required")` | Untyped argument validation error |
| `pkg/tools` | `edit.go:46` | `errors.New("edit: oldText must be non-empty")` | Untyped argument validation error |
| `pkg/tools` | `glob.go:36` | `errors.New("glob: pattern is required")` | Untyped argument validation error |
| `pkg/tools` | `grep.go:40` | `errors.New("grep: pattern is required")` | Untyped argument validation error |
| `pkg/tools` | `bash.go:43` | `errors.New("bash: command is required")` | Untyped argument validation error |
| `pkg/tools` | `ask.go:67` | `errors.New("askQuestion: question is required")` | Untyped argument validation error |

---

### 1.2 Ad-Hoc `fmt.Errorf` Formatted Strings
Over 50 locations format error messages directly with `fmt.Errorf`. Many do not wrap inner errors, or wrap them with inconsistent package prefixes:

#### `pkg/config/config.go`
- Line 66: `fmt.Errorf("invalid BaseURL %q: %w", c.BaseURL, err)` — **BUG**: If `url.Parse` returns `err == nil` but `u.Scheme == ""`, `err` is `nil`, wrapping a nil error operand with `%w`.
- Line 69: `fmt.Errorf("BaseURL scheme must be https or http, got %q", u.Scheme)`
- Line 72: `fmt.Errorf("temperature must be 0..2, got %v", c.Temperature)`
- Line 87: `fmt.Errorf("getwd: %w", err)`
- Line 93: `fmt.Errorf("workspace: %w", err)`
- Line 98: `fmt.Errorf("workspace %q: %w", ws, err)`
- Line 100: `fmt.Errorf("workspace %q is not a directory", ws)`

#### `pkg/llm`
- `client.go:55`: `fmt.Errorf("deepseek: invalid BaseURL %q: %w", c.baseURL(), err)` — Same nil `%w` bug as config.
- `client.go:110`: `fmt.Errorf("deepseek stream canceled: %w", ctx.Err())`
- `client.go:116`: `fmt.Errorf("deepseek stream canceled during backoff: %w", ctx.Err())`
- `client.go:125`: `fmt.Errorf("deepseek: marshal request: %w", err)`
- `client.go:129`: `fmt.Errorf("deepseek: new request: %w", err)`
- `client.go:137`: `fmt.Errorf("deepseek: do request: %w", err)`
- `sse.go:38`: `fmt.Errorf("deepseek: context canceled: %w", ctx.Err())`
- `sse.go:49`: `fmt.Errorf("deepseek: onDelta done: %w", err)`
- `sse.go:111`: `fmt.Errorf("deepseek: onDelta: %w", err)`
- `sse.go:118`: `fmt.Errorf("deepseek: SSE line too large (%d > %d)", maxSSLine+1, maxSSLine)` (unwrapped size limit)
- `sse.go:120`: `fmt.Errorf("deepseek: read SSE: %w", err)`

#### `pkg/tools`
- `secure.go:16`: `fmt.Errorf("absolute paths not allowed: %q", p)`
- `secure.go:21`: `fmt.Errorf("path outside workspace: %q", p)`
- `secure.go:34`: `fmt.Errorf("symlink outside workspace: %q", p)`
- `view.go:29`, `write.go:27`, `edit.go:31`, `ls.go:23`, `glob.go:26`, `grep.go:29`, `bash.go:32`: `fmt.Errorf("<tool>: context canceled: %w", err)`
- `view.go:37`, `write.go:34`, `edit.go:39`, `ls.go:30`, `glob.go:32`, `grep.go:36`, `bash.go:39`, `ask.go:63`: `fmt.Errorf("<tool>: invalid args: %w", err)`
- `view.go:50`: `fmt.Errorf("view: offset must be >=0, got %d", offset)`
- `view.go:53`: `fmt.Errorf("view: limit must be 1..200, got %d", limit)`
- `view.go:64`: `fmt.Errorf("view: %q is a directory, not a file", a.FilePath)`
- `view.go:67`: `fmt.Errorf("view: file too large (%d > %d bytes)", info.Size(), MaxFileReadSize)`
- `view.go:80`: `fmt.Errorf("view: file has %d lines, offset %d out of range", total, offset)`
- `write.go:41`: `fmt.Errorf("write: content too large (%d > %d bytes)", len(a.Content), MaxWriteSize)`
- `edit.go:49`: `fmt.Errorf("edit: newText too large (%d > %d)", len(a.NewText), MaxWriteSize)`
- `edit.go:60`: `fmt.Errorf("edit: file too large (%d > %d)", len(b), MaxWriteSize)`
- `edit.go:65`: `fmt.Errorf("edit: oldText not found")`
- `edit.go:68`: `fmt.Errorf("edit: oldText matched %d times, must be unique", count)`
- `edit.go:72`: `fmt.Errorf("edit: resulting file too large (%d > %d)", len(content), MaxWriteSize)`
- `glob.go:39`: `fmt.Errorf("glob: pattern outside workspace")`
- `grep.go:53`: `fmt.Errorf("grep: %q is not a directory", *a.Path)`
- `bash.go:46`: `fmt.Errorf("bash: command too long (%d > %d)", len(a.Command), MaxCommandLength)`
- `bash.go:50`: `fmt.Errorf("bash: timeout must be 1000..120000 ms, got %d", *a.Timeout)`

#### `pkg/agent`
- `agent.go:86`: `fmt.Errorf("agent: MaxIters must be >=0, got %d", a.MaxIters)`
- `agent.go:144`: `fmt.Errorf("agent: context too large (%d chars > %d)", n, maxContextChars)`
- `agent.go:164`: `fmt.Errorf("agent: context canceled before iter %d: %w", iter, err)`
- `agent.go:174`: `fmt.Errorf("agent onDelta canceled: %w", ctx.Err())`
- `agent.go:187`: `fmt.Errorf("agent: LLM StreamChat iter %d: %w", iter, err)`
- `agent.go:204`: `fmt.Errorf("agent: max iterations (%d) reached", a.maxIters())`
- `agent.go:210`: `fmt.Errorf("agent: context canceled before tool %q: %w", tc.Function.Name, err)`

#### `pkg/session`
- `session.go:45`: `fmt.Errorf("invalid session id %q: must not contain path separators", id)`
- `session.go:48`: `fmt.Errorf("invalid session id %q: must match %s", id, validID.String())`
- `session.go:64`: `fmt.Errorf("session path outside store dir: %q", id)`
- `session.go:71`: `fmt.Errorf("session canceled: %w", err)`
- `session.go:91`: `fmt.Errorf("session marshal: %w", err)`
- `session.go:130`: `fmt.Errorf("session load: %w", err)`
- `session.go:134`: `fmt.Errorf("session empty: %q", id)`
- `session.go:152`: `fmt.Errorf("session %q: no valid record: %w", id, lastErr)`
- `session.go:154`: `fmt.Errorf("session empty: %q", id)`
- `session.go:188`: `fmt.Errorf("session list: %w", err)`
- `session.go:206`: `fmt.Errorf("session delete: %w", err)`
- `session.go:222`: `fmt.Errorf("session prune list: %w", err)`
- `session.go:228`: `fmt.Errorf("session prune canceled: %w", ctx.Err())`

#### `pkg/engine`
- `client.go:37`: `fmt.Errorf("ws parse url: %w", err)`
- `client.go:49`: `fmt.Errorf("ws dial %s: %w", u.String(), err)`
- `client.go:57`: `fmt.Errorf("ws marshal: %w", err)`
- `client.go:60`: `fmt.Errorf("ws write chat.req: %w", err)`
- `client.go:67`: `fmt.Errorf("ws context canceled: %w", ctx.Err())`
- `client.go:73`: `fmt.Errorf("ws read: %w", err)`
- `client.go:97`: `fmt.Errorf("engine error: %s", e)`
- `client.go:99`: `fmt.Errorf("engine error: %v", string(in.Payload))`
- `conn.go:141`: `fmt.Sprintf("bad envelope: %v", err)`
- `conn.go:145`: `fmt.Sprintf("unsupported ver %q, want %q", env.Ver, protocol.Ver)`
- `conn.go:181`: `fmt.Sprintf("unknown type %q", env.Type)`
- `handlers.go:34`: `fmt.Sprintf("bad %s: %v", label, err)`
- `handlers.go:43`: `fmt.Sprintf("list sessions: %v", err)`
- `handlers.go:66`: `fmt.Sprintf("load session: %v", err)`
- `handlers.go:98`: `fmt.Sprintf("delete session: %v", err)`
- `handlers.go:110`: `fmt.Sprintf("rename session: %v", err)`

---

## 2. Panics, Unchecked Type Assertions, and Nil Safety Hazards

### 2.1 Explicit Panic
**Location**: `pkg/protocol/protocol.go:35`
```go
// MustMarshalPayload marshals v to json.RawMessage. Panics on error (caller bug).
func MustMarshalPayload(v any) json.RawMessage {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
```
**Risk**: `MustMarshalPayload` is called by `NewEnvelope` and `NewEnvelopeWithID` across the entire engine and client code paths. If a developer or plugin passes a payload type containing unexported channels, functions, or circular references, the entire server/client process panics and crashes immediately.
**Remedy**: Provide safe `MarshalPayload(v any) (json.RawMessage, error)` and replace panic with error propagation.

---

### 2.2 Unchecked Nil Pointer Dereferences

#### 1. `pkg/tools/grep.go:53` (Panic on nil pointer dereference)
```go
func (t *GrepTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	...
	var a struct {
		Pattern string  `json:"pattern"`
		Path    *string `json:"path"`
	}
	...
	dir := t.Root
	if a.Path != nil && strings.TrimSpace(*a.Path) != "" {
		var err error
		dir, err = secureJoin(t.Root, *a.Path)
		if err != nil {
			return "", fmt.Errorf("grep: %w", err)
		}
	}
	if info, err := os.Stat(dir); err != nil {
		return "", fmt.Errorf("grep: %w", err)
	} else if !info.IsDir() {
		return "", fmt.Errorf("grep: %q is not a directory", *a.Path) // <--- PANIC IF a.Path == nil!
	}
```
**Trigger**: When `a.Path` is omitted (null in JSON) and `t.Root` is not a directory (or removed), `*a.Path` dereferences `nil`, causing an instant panic in `GrepTool.Execute`.

#### 2. `pkg/engine/client.go:109` (Panic on slice out-of-bounds)
```go
case protocol.TypeAskReq:
	var ar protocol.AskReq
	if err := in.Decode(&ar); err != nil {
		c.logger().Warn("bad ask.req", "err", err)
		continue
	}
	if askHandler == nil {
		askHandler = func(ctx context.Context, rq tools.AskRequest) (tools.AskResponse, error) {
			// fallback auto-select
			return tools.AskResponse{Selected: 0, Answer: rq.Options[0], Label: rq.Options[0]}, nil // <--- PANIC IF rq.Options is empty!
		}
	}
```
**Trigger**: If the incoming `AskReq` contains empty `Options: []`, indexing `rq.Options[0]` panics.

#### 3. `pkg/agent/agent.go:190` (Panic on nil message pointer)
```go
msg, err := a.LLM.StreamChat(ctx, req, func(d llm.Delta) error { ... })
if err != nil { ... return nil, ... }
messages = append(messages, *msg) // <--- PANIC IF msg is nil when err == nil
```
**Trigger**: In ports-and-adapters architecture, if a custom adapter or mock returns `nil, nil`, dereferencing `*msg` panics without a clear error.

#### 4. `pkg/config/config.go:66` & `pkg/llm/client.go:55` (Nil operand in `%w`)
```go
u, err := url.Parse(strings.TrimSpace(c.BaseURL))
if err != nil || u.Scheme == "" || u.Host == "" {
	return fmt.Errorf("invalid BaseURL %q: %w", c.BaseURL, err)
}
```
**Trigger**: If `BaseURL` is `"invalid_no_scheme"`, `url.Parse` succeeds without error (`err == nil`), but `u.Scheme == ""`. Then `fmt.Errorf("...: %w", nil)` wraps `nil`. In Go, wrapping `nil` formats as `%!w(<nil>)` and breaks subsequent `errors.Unwrap` inspection.

---

### 2.3 Fragile Substring Error Inspection
**Location**: `pkg/llm/retry.go:61-64`
```go
func isRetryable(status int, err error) bool {
	if err != nil {
		...
		var le *LLMError
		if errors.As(err, &le) {
			// typed LLM error — check status below
		} else {
			if errors.Is(err, context.DeadlineExceeded) {
				return true
			}
			msg := err.Error()
			if strings.Contains(msg, "marshal") || strings.Contains(msg, "invalid BaseURL") {
				return false
			}
			return true // network errors are retryable
		}
	}
```
**Issue**: Classifying error retryability based on whether `err.Error()` contains substrings (`"marshal"`, `"invalid BaseURL"`) is extremely fragile and breaks whenever error text is modified. It must be replaced by typed errors and `errors.Is`.

---

### 2.4 Unchecked Type Assertions in Tests
**Locations**:
- `pkg/llm/deepseek_test.go:28`: `w.(http.Flusher).Flush()`
- `pkg/llm/llm_test.go:24`: `w.(http.Flusher).Flush()`
**Remedy**: Use `if f, ok := w.(http.Flusher); ok { f.Flush() }`.

---

### 2.5 Unhandled Error Returns
- `pkg/engine/handlers.go:85`: `_ = c.sessionStore().SaveWithTitle(...)` (Session initialization error dropped).
- `pkg/engine/handlers.go:87`: `_ = c.sessionStore().Save(...)` (Session initialization error dropped).
- `pkg/engine/client.go:95`: `_ = in.Decode(&m)` (Envelope decode error dropped).
- `pkg/engine/client.go:120`: `_ = ws.WriteMessage(...)` (WS error dropped).
- `pkg/tools/glob.go:73`: `_ = filepath.WalkDir(...)` (Walk error ignored).

---

## 3. Assessment of Unified Domain Error Hierarchy Need

### Why Excelsior Needs a Unified Domain Error Hierarchy

1. **SOLID & Layer Decoupling**:
   In clean architecture, upper layers (`pkg/engine`, `pkg/tui`, `cmd/excelsior`) should make operational decisions based on semantic error contracts, not by parsing string error messages emitted by lower layers (`pkg/llm`, `pkg/tools`, `pkg/session`).
2. **Robust LLM Agent Feedback Loop**:
   When a tool fails in `pkg/agent`, the agent loop currently passes raw strings like `"error: path outside workspace: ../foo"` or `"error: view: file too large (6000000 > 5242880 bytes)"` back to the model. Having structured tool errors allows the agent to inform the LLM with structured diagnostics (e.g. error category: `validation`, `security`, `not_found`, `timeout`).
3. **Resilient Retry Policy**:
   Network retry logic in `pkg/llm` requires deterministic classification of transient vs. permanent failures via typed error predicates (`IsAuth()`, `IsRateLimit()`, `IsServer()`, `IsNetwork()`) instead of ad-hoc string inspections.
4. **Standard Go 1.20+ / 1.24 Idioms**:
   Adopting `errors.Is`, `errors.As`, and custom `Unwrap() []error` or `Unwrap() error` brings the codebase up to modern Go production standards.

---

## 4. Complete Domain Error Hierarchy Specification

Below is the formal domain error hierarchy specification designed for Excelsior.

```
                  ┌──────────────────────┐
                  │   Standard error     │
                  └──────────┬───────────┘
                             │
     ┌──────────────┬────────┼──────────────┬──────────────┬──────────────┐
     │              │        │              │              │              │
┌────┴────┐   ┌─────┴────┐ ┌─┴──────┐   ┌───┴────┐   ┌─────┴─────┐  ┌─────┴──────┐
│ Config  │   │   LLM    │ │ Tools  │   │ Agent  │   │  Session  │  │  Protocol  │
│ Errors  │   │  Errors  │ │ Errors │   │ Errors │   │  Errors   │  │   Errors   │
└─────────┘   └──────────┘ └────────┘   └────────┘   └───────────┘  └────────────┘
```

---

### 4.1 `pkg/config` Error Hierarchy

#### Sentinel Errors
```go
package config

import "errors"

var (
	ErrMissingAPIKey      = errors.New("config: DEEPSEEK_API_KEY is required")
	ErrMissingModel       = errors.New("config: model is required")
	ErrInvalidBaseURL     = errors.New("config: invalid BaseURL")
	ErrInvalidWorkspace   = errors.New("config: invalid workspace")
	ErrInvalidTemperature = errors.New("config: invalid temperature (must be between 0.0 and 2.0)")
	ErrNotADirectory      = errors.New("config: workspace path is not a directory")
)
```

#### Structured Error Type
```go
type ConfigError struct {
	Field   string
	Value   any
	Message string
	Err     error
}

func (e *ConfigError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("config error on %s (%v): %s: %v", e.Field, e.Value, e.Message, e.Err)
	}
	return fmt.Sprintf("config error on %s (%v): %s", e.Field, e.Value, e.Message)
}

func (e *ConfigError) Unwrap() error {
	return e.Err
}

func (e *ConfigError) Is(target error) bool {
	return errors.Is(e.Err, target)
}
```

---

### 4.2 `pkg/llm` Error Hierarchy

#### Error Kinds & Sentinels
```go
package llm

import "errors"

var (
	ErrAuthFailed        = errors.New("llm: authentication failed (401/403)")
	ErrRateLimit         = errors.New("llm: rate limit exceeded (429)")
	ErrServerUnavailable = errors.New("llm: server error / unavailable (5xx)")
	ErrInvalidRequest    = errors.New("llm: invalid request parameters (400)")
	ErrStreamInterrupted = errors.New("llm: stream read interrupted")
	ErrLineTooLarge      = errors.New("llm: SSE line exceeds maximum buffer size")
	ErrMissingAPIKey     = errors.New("llm: API key is not configured")
	ErrInvalidBaseURL    = errors.New("llm: invalid base URL")
)

type ErrorKind int

const (
	ErrorKindUnknown ErrorKind = iota
	ErrorKindAuth
	ErrorKindRateLimit
	ErrorKindServer
	ErrorKindValidation
	ErrorKindNetwork
	ErrorKindStream
)
```

#### Structured `LLMError`
```go
type LLMError struct {
	StatusCode int
	Kind       ErrorKind
	Body       string
	Model      string
	Err        error
}

func (e *LLMError) Error() string {
	if e.Body != "" {
		return fmt.Sprintf("llm [%s] status %d: %s", e.Model, e.StatusCode, e.Body)
	}
	if e.Err != nil {
		return fmt.Sprintf("llm [%s] status %d: %v", e.Model, e.StatusCode, e.Err)
	}
	return fmt.Sprintf("llm [%s] status %d", e.Model, e.StatusCode)
}

func (e *LLMError) Unwrap() error {
	return e.Err
}

func (e *LLMError) Is(target error) bool {
	switch target {
	case ErrAuthFailed:
		return e.StatusCode == 401 || e.StatusCode == 403 || e.Kind == ErrorKindAuth
	case ErrRateLimit:
		return e.StatusCode == 429 || e.Kind == ErrorKindRateLimit
	case ErrServerUnavailable:
		return (e.StatusCode >= 500 && e.StatusCode <= 599) || e.Kind == ErrorKindServer
	case ErrInvalidRequest:
		return e.StatusCode == 400 || e.Kind == ErrorKindValidation
	default:
		return errors.Is(e.Err, target)
	}
}

func (e *LLMError) IsRetryable() bool {
	switch e.StatusCode {
	case 429, 500, 502, 503, 504:
		return true
	default:
		return e.Kind == ErrorKindNetwork
	}
}
```

---

### 4.3 `pkg/tools` Error Hierarchy

#### Sentinels
```go
package tools

import "errors"

var (
	ErrToolNotFound          = errors.New("tools: tool not found in registry")
	ErrInvalidArguments      = errors.New("tools: invalid arguments")
	ErrPathOutsideWorkspace  = errors.New("tools: path outside workspace (security violation)")
	ErrFileTooLarge          = errors.New("tools: file exceeds maximum allowed size")
	ErrCommandTooLong        = errors.New("tools: command exceeds maximum length")
	ErrCommandTimeout        = errors.New("tools: command timed out")
	ErrTextNotFound          = errors.New("tools: target text not found")
	ErrAmbiguousMatch        = errors.New("tools: target text matched multiple times (must be unique)")
	ErrNotADirectory         = errors.New("tools: target path is not a directory")
	ErrIsADirectory          = errors.New("tools: target path is a directory, not a file")
	ErrOffsetOutOfRange      = errors.New("tools: line offset out of range")
)
```

#### Structured `ToolError`
```go
type ToolError struct {
	Tool string // "view", "edit", "write", "bash", "grep", "ls", "glob", "askQuestion"
	Path string // File or directory path when applicable
	Op   string // "read", "write", "exec", "stat", "match", "validate"
	Err  error  // Underlying cause or sentinel
}

func (e *ToolError) Error() string {
	if e.Path != "" {
		return fmt.Sprintf("%s (%s %q): %v", e.Tool, e.Op, e.Path, e.Err)
	}
	return fmt.Sprintf("%s (%s): %v", e.Tool, e.Op, e.Err)
}

func (e *ToolError) Unwrap() error {
	return e.Err
}

func (e *ToolError) Is(target error) bool {
	return errors.Is(e.Err, target)
}
```

---

### 4.4 `pkg/agent` Error Hierarchy

#### Sentinels
```go
package agent

import "errors"

var (
	ErrMaxIterationsReached = errors.New("agent: maximum tool iterations reached")
	ErrContextTooLarge      = errors.New("agent: conversation context exceeds maximum character limit")
	ErrEmptyMessages        = errors.New("agent: messages history is empty")
	ErrLLMNotConfigured     = errors.New("agent: LLM provider not configured")
	ErrInvalidConfig        = errors.New("agent: invalid agent configuration")
)
```

#### Structured `AgentError`
```go
type AgentError struct {
	Iteration int
	Phase     string // "validate", "stream_chat", "tool_exec", "delta_callback"
	Err       error
}

func (e *AgentError) Error() string {
	if e.Iteration > 0 {
		return fmt.Sprintf("agent [%s iter %d]: %v", e.Phase, e.Iteration, e.Err)
	}
	return fmt.Sprintf("agent [%s]: %v", e.Phase, e.Err)
}

func (e *AgentError) Unwrap() error {
	return e.Err
}

func (e *AgentError) Is(target error) bool {
	return errors.Is(e.Err, target)
}
```

---

### 4.5 `pkg/session` Error Hierarchy

#### Sentinels
```go
package session

import "errors"

var (
	ErrSessionNotFound   = errors.New("session: not found")
	ErrInvalidSessionID  = errors.New("session: invalid session ID format or path traversal")
	ErrCorruptedSession  = errors.New("session: file corrupted (no valid JSON record found)")
	ErrEmptySession      = errors.New("session: file is empty")
	ErrStoreDirEmpty     = errors.New("session: store directory not configured")
)
```

#### Structured `SessionError`
```go
type SessionError struct {
	SessionID string
	Op        string // "load", "save", "delete", "list", "prune", "rename"
	Path      string
	Err       error
}

func (e *SessionError) Error() string {
	if e.SessionID != "" {
		return fmt.Sprintf("session %s [%s]: %v", e.SessionID, e.Op, e.Err)
	}
	return fmt.Sprintf("session [%s]: %v", e.Op, e.Err)
}

func (e *SessionError) Unwrap() error {
	return e.Err
}

func (e *SessionError) Is(target error) bool {
	return errors.Is(e.Err, target)
}
```

---

### 4.6 `pkg/protocol` & `pkg/engine` Error Hierarchy

#### Sentinels
```go
package protocol

import "errors"

var (
	ErrUnsupportedVersion     = errors.New("protocol: unsupported version")
	ErrInvalidEnvelope        = errors.New("protocol: invalid message envelope")
	ErrPayloadMarshal         = errors.New("protocol: failed to marshal payload")
	ErrPayloadDecode          = errors.New("protocol: failed to decode payload")
)
```

```go
package engine

import "errors"

var (
	ErrAlreadyStreaming        = errors.New("engine: turn in progress, already streaming")
	ErrConnectionClosed        = errors.New("engine: websocket connection closed")
	ErrSendBufferFull          = errors.New("engine: send buffer full")
	ErrRemoteEngine            = errors.New("engine: remote engine error")
)
```

#### Safe Non-Panicking Payload Helper
```go
// MarshalPayload encodes v to json.RawMessage safely without panicking.
func MarshalPayload(v any) (json.RawMessage, error) {
	if v == nil {
		return nil, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrPayloadMarshal, err)
	}
	return b, nil
}
```

---

## 5. Enumeration of All R2 Refactoring Targets

To achieve full compliance with Requirement **R2 (Idiomatic Domain Error Handling & Type Safety)** and the project acceptance criteria, the following tasks must be implemented:

| Package | Target File(s) | Specific Refactoring Actions Required |
|---|---|---|
| `pkg/config` | `config.go`, `config_test.go` | 1. Define sentinel errors (`ErrMissingAPIKey`, `ErrMissingModel`, `ErrInvalidBaseURL`, `ErrInvalidWorkspace`, `ErrInvalidTemperature`, `ErrNotADirectory`).<br>2. Define `ConfigError` with `Unwrap()` and `Is()`.<br>3. Fix nil `%w` wrapping in `Validate()` when `u.Scheme == ""`.<br>4. Update tests to assert `errors.Is(err, config.ErrMissingAPIKey)`. |
| `pkg/llm` | `types.go`, `client.go`, `retry.go`, `sse.go`, `llm_test.go` | 1. Define sentinels (`ErrAuthFailed`, `ErrRateLimit`, `ErrServerUnavailable`, `ErrInvalidRequest`, `ErrStreamInterrupted`, `ErrLineTooLarge`, `ErrMissingAPIKey`).<br>2. Extend `LLMError` with `Kind ErrorKind`, `IsRetryable()`, and `Is(target)`.<br>3. Replace string search in `retry.go:62` with typed `isRetryable` logic.<br>4. Fix nil `%w` wrapping bug in `client.go:55`.<br>5. Fix unchecked type assertion `w.(http.Flusher)` in `llm_test.go` and `deepseek_test.go`. |
| `pkg/tools` | `tools.go`, `secure.go`, `view.go`, `write.go`, `edit.go`, `ls.go`, `glob.go`, `grep.go`, `bash.go`, `ask.go`, `tools_test.go` | 1. Define sentinels (`ErrToolNotFound`, `ErrInvalidArguments`, `ErrPathOutsideWorkspace`, `ErrFileTooLarge`, `ErrCommandTooLong`, `ErrCommandTimeout`, `ErrTextNotFound`, `ErrAmbiguousMatch`, `ErrNotADirectory`, `ErrIsADirectory`, `ErrOffsetOutOfRange`).<br>2. Define `ToolError` with structured fields (`Tool`, `Path`, `Op`, `Err`).<br>3. Fix nil dereference panic in `grep.go:53` on `*a.Path`.<br>4. Wrap all tool execution failures in `ToolError`.<br>5. Refactor `tools_test.go` to use `errors.Is` instead of string matching. |
| `pkg/agent` | `agent.go`, `agent_test.go` | 1. Define sentinels (`ErrMaxIterationsReached`, `ErrContextTooLarge`, `ErrEmptyMessages`, `ErrLLMNotConfigured`, `ErrInvalidConfig`).<br>2. Define `AgentError` with `Unwrap()` and `Is()`.<br>3. Guard against nil `*msg` pointer in `RunWithHistory`.<br>4. Update `agent_test.go` to assert errors with `errors.Is`. |
| `pkg/session` | `session.go`, `session_test.go` | 1. Define sentinels (`ErrSessionNotFound`, `ErrInvalidSessionID`, `ErrCorruptedSession`, `ErrEmptySession`, `ErrStoreDirEmpty`).<br>2. Define `SessionError` with `Unwrap()` and `Is()`.<br>3. Distinguish `os.ErrNotExist` as `ErrSessionNotFound`.<br>4. Update tests to verify `errors.Is(err, session.ErrSessionNotFound)`. |
| `pkg/protocol` | `protocol.go`, `protocol_test.go` | 1. Eliminate `panic(err)` in `MustMarshalPayload` or provide safe `MarshalPayload`.<br>2. Define protocol sentinels (`ErrUnsupportedVersion`, `ErrInvalidEnvelope`, `ErrPayloadMarshal`, `ErrPayloadDecode`). |
| `pkg/engine` | `hub.go`, `conn.go`, `chat_handler.go`, `handlers.go`, `client.go`, `engine_test.go` | 1. Define engine sentinels (`ErrAlreadyStreaming`, `ErrConnectionClosed`, `ErrRemoteEngine`).<br>2. Fix slice bounds panic in `client.go:109` on `rq.Options[0]`.<br>3. Handle/log unhandled errors in `handlers.go:85,87` and `client.go:95,120`.<br>4. Propagate typed engine errors across WS client. |
| `pkg/tui` | `start.go`, `update.go`, `run.go` | 1. Display friendly error messages based on domain error types rather than raw strings.<br>2. Respect typed context cancellations cleanly. |
| `cmd/excelsior` | `main.go`, `tui.go`, `engine.go` | 1. Format CLI errors with `errors.Is` / `errors.As` (e.g. exit code 2 on validation/auth errors vs exit code 1 on runtime errors).<br>2. Clean CLI error output. |

---

## 6. Verification and Validation Strategy

To verify the error handling elevation:
1. **Unit Test Suite**:
   Run `go test -race ./...` ensuring all error assertion tests verify `errors.Is(err, pkg.ErrSentinel)` and `errors.As(err, &pkg.StructuredError{})`.
2. **Panic Fuzzing & Static Analysis**:
   - Run `go vet ./...` across all packages.
   - Verify zero unchecked type assertions via linter or manual audit.
   - Run nil safety checks on tool execution paths (especially `grep`, `view`, `edit`, `ask`).
3. **End-to-End Fault Injection Tests**:
   - Simulate DeepSeek API 429 / 503 / 401 errors and verify typed `LLMError` propagation and exponential backoff retry.
   - Simulate path traversal (`../../etc/passwd`) in `pkg/tools` and verify `ErrPathOutsideWorkspace`.
   - Simulate infinite tool loop and verify `ErrMaxIterationsReached`.
   - Simulate session file corruption and verify `ErrCorruptedSession`.
