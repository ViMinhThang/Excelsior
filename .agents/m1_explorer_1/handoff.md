# Handoff Report: Milestone 1 Domain Error Hierarchy Architecture

**Agent**: `m1_explorer_1` (Explorer 1)  
**Parent**: `orchestrator_1` (`8884cc3c-d4d3-4cb8-91b1-a31965788d96`)  
**Scope**: Concrete domain error hierarchy, sentinel errors, and error wrapping implementations for `pkg/config`, `pkg/llm`, and `pkg/tools`.  
**Artifacts**: `analysis.md`, `handoff.md`

---

## 1. Observation

Direct code observations from inspecting the codebase:

1. **`pkg/config/config.go:58-74`**:
   - `Validate()` returns ad-hoc strings: `errors.New("DEEPSEEK_API_KEY is required")` (line 59) and `errors.New("model is required")` (line 62).
   - Line 64-67:
     ```go
     u, err := url.Parse(strings.TrimSpace(c.BaseURL))
     if err != nil || u.Scheme == "" || u.Host == "" {
         return fmt.Errorf("invalid BaseURL %q: %w", c.BaseURL, err)
     }
     ```
     When `c.BaseURL` lacks a scheme (e.g., `"localhost:8080"`), `url.Parse` succeeds (`err == nil`) and `u.Scheme == ""`. Wrapping `err` with `%w` causes `%w` to format a nil operand (`%!w(<nil>)`), breaking `errors.Unwrap`.
   - `ResolveWorkspace()` returns ad-hoc `fmt.Errorf` without typed domain sentinels for non-existent paths or non-directories.

2. **`pkg/llm/retry.go:49-74`**:
   - Error retryability classification relies on brittle substring checks:
     ```go
     msg := err.Error()
     if strings.Contains(msg, "marshal") || strings.Contains(msg, "invalid BaseURL") {
         return false
     }
     return true // network errors are retryable
     ```
   - `LLMError` lacks an `ErrorKind` enum and an `IsRetryable()` method.
   - `client.go:51` returns untyped `errors.New("deepseek: APIKey is empty (set DEEPSEEK_API_KEY)")`.
   - `client.go:144-146` creates `LLMError` without sentinel error wrapping or status categorization.
   - `sse.go:118` returns `fmt.Errorf("deepseek: SSE line too large (%d > %d)", maxSSLine+1, maxSSLine)`.

3. **`pkg/tools/` Subsystem**:
   - Zero sentinel errors defined across `bash.go`, `view.go`, `write.go`, `edit.go`, `glob.go`, `grep.go`, `ls.go`, `ask.go`, and `secure.go`.
   - `secure.go:13-35` returns `errors.New("path is empty")` and `fmt.Errorf("path outside workspace: %q", p)`.
   - `grep.go:53`: `fmt.Errorf("grep: %q is not a directory", *a.Path)` unconditionally dereferences `*a.Path`, which causes a nil-pointer dereference panic when `a.Path` is omitted (nil).
   - `edit.go:65-68` returns `fmt.Errorf("edit: oldText not found")` and `fmt.Errorf("edit: oldText matched %d times, must be unique", count)`.

---

## 2. Logic Chain

1. **Premise 1 (Sentinel & Structured Hierarchy)**:
   - For callers and upstream agents to programmatically handle errors, each domain package must export typed sentinels and custom error types implementing `Error()`, `Unwrap() error`, and `Is(target error) bool`.
   - In `pkg/config`, `ConfigError` wraps `ErrMissingAPIKey`, `ErrMissingModel`, `ErrInvalidBaseURL`, `ErrInvalidWorkspace`, `ErrInvalidTemperature`, and `ErrNotADirectory`.

2. **Premise 2 (Elimination of Nil `%w` Formatting)**:
   - In `Validate()`, by branching on whether `url.Parse` returned an error vs. failed scheme/host checks, we wrap `ErrInvalidBaseURL` without formatting a nil `err` operand.

3. **Premise 3 (Type-Safe LLM Resilience)**:
   - In `pkg/llm`, by introducing `ErrorKind` (`ErrorKindAuth`, `ErrorKindRateLimit`, `ErrorKindServer`, `ErrorKindValidation`, `ErrorKindNetwork`, `ErrorKindStream`) and attaching `IsRetryable() bool` directly to `LLMError`, `retry.go` inspects errors via `errors.As(err, &llmErr)` and `llmErr.IsRetryable()`, entirely eliminating substring heuristics (`strings.Contains`).

4. **Premise 4 (Tool Uniformity & Panic Prevention)**:
   - In `pkg/tools`, by introducing `ToolError` (`Tool`, `Op`, `Path`, `Err`) and sentinels (`ErrToolNotFound`, `ErrInvalidArguments`, `ErrPathOutsideWorkspace`, `ErrFileTooLarge`, `ErrCommandTooLong`, `ErrCommandTimeout`, `ErrTextNotFound`, `ErrAmbiguousMatch`, `ErrNotADirectory`, `ErrIsADirectory`, `ErrOffsetOutOfRange`), tool execution errors become structured.
   - In `grep.go`, checking and using a resolved `displayPath` prevents nil pointer dereference on `*a.Path`.

---

## 3. Caveats

- **Scope Boundary**: This design covers `pkg/config`, `pkg/llm`, and `pkg/tools`. Upstream packages (`pkg/agent`, `pkg/session`, `pkg/protocol`, `pkg/engine`) are handled in subsequent milestones or by peer specialists, though our designs ensure full backward and forward compatibility.
- **Legacy Helpers**: `llm.isRetryable(status, err)` should be preserved as an alias or forwarded to `llm.IsRetryable(err)` so existing test suites continue passing seamlessly during phased rollout.

---

## 4. Conclusion

A unified, typed domain error hierarchy has been fully designed and specified with exact code blueprints in `analysis.md`:
1. **`pkg/config`**: `errors.go` with 6 sentinels, structured `ConfigError`, nil-wrapping fix in `Validate()`, and workspace resolution error handling.
2. **`pkg/llm`**: `errors.go` with 8 sentinels, 7-variant `ErrorKind`, structured `LLMError` with `IsRetryable()` / `Is()`, refactored `retry.go` eliminating string matching, and structured HTTP/SSE error propagation.
3. **`pkg/tools`**: `errors.go` with 11 sentinels, structured `ToolError`, nil-dereference fix in `grep.go`, and complete migration blueprint across all 8 tools and `secureJoin`.

---

## 5. Verification Method

To verify the design once implemented:
1. **Unit Tests**:
   - `go test -v ./pkg/config/...` — Verifies `errors.Is(err, config.ErrMissingAPIKey)`, `config.ErrInvalidBaseURL`, etc.
   - `go test -v ./pkg/llm/...` — Verifies `errors.Is(err, llm.ErrRateLimit)`, `errors.Is(err, llm.ErrAuthFailed)`, `LLMError.IsRetryable()`, and retry backoff.
   - `go test -v ./pkg/tools/...` — Verifies `errors.Is(err, tools.ErrPathOutsideWorkspace)`, `tools.ErrTextNotFound`, `tools.ErrAmbiguousMatch`, etc.
2. **Full Workspace Test & Vet**:
   - `go test ./...` — Ensures 100% clean test passes across all packages.
   - `go vet ./...` — Ensures 0 static analysis diagnostics.
3. **Invalidation Conditions**:
   - Any remaining `strings.Contains` on error messages in `retry.go`.
   - Any `%w` formatting on nil error operands in `config.go` or `client.go`.
   - Any unhandled nil dereference when calling `GrepTool.Execute` with empty `a.Path`.
