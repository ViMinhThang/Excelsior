# Handoff Report: Error Handling, Type Safety, and Panic Risks Survey

**Agent**: survey_explorer_2 (Explorer 2)  
**Parent Agent**: orchestrator_1 (`8884cc3c-d4d3-4cb8-91b1-a31965788d96`)  
**Workspace Root**: `c:\Users\huynh\OneDrive\Desktop\projects\excelsior`  
**Full Survey Report**: `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\survey_explorer_2\survey_report.md`  

---

## 1. Observation

Direct observations from the codebase investigation:

1. **Explicit Panic**:
   - `pkg/protocol/protocol.go:35`: `MustMarshalPayload` explicitly calls `panic(err)` when `json.Marshal(v)` fails. It is called by `NewEnvelope` and `NewEnvelopeWithID` across the engine layer.
2. **Nil Pointer Dereferences and Out-of-Bounds Indexing**:
   - `pkg/tools/grep.go:53`: `fmt.Errorf("grep: %q is not a directory", *a.Path)` — when `a.Path == nil`, `dir` is initialized to `t.Root`. If `t.Root` is not a directory or deleted, `*a.Path` is dereferenced while `a.Path` is nil, causing a panic.
   - `pkg/engine/client.go:109`: `return tools.AskResponse{Selected: 0, Answer: rq.Options[0], Label: rq.Options[0]}` — if `rq.Options` is an empty slice, accessing index 0 panics with index out of range.
   - `pkg/agent/agent.go:190`: `messages = append(messages, *msg)` — if a custom or mock `LLM` returns `(*llm.Message(nil), nil)`, dereferencing `*msg` panics.
   - `pkg/config/config.go:66` & `pkg/llm/client.go:55`: `fmt.Errorf("invalid BaseURL %q: %w", c.BaseURL, err)` where `url.Parse` succeeds on unparseable URIs without scheme (e.g. `"foo"`), resulting in `err == nil`. Passing `nil` to `%w` creates `%!w(<nil>)` and breaks error unwrapping.
3. **Unchecked Type Assertions**:
   - `pkg/llm/deepseek_test.go:28`: `w.(http.Flusher).Flush()`
   - `pkg/llm/llm_test.go:24`: `w.(http.Flusher).Flush()`
4. **Fragile String-Matching for Error Classification**:
   - `pkg/llm/retry.go:61-64`:
     ```go
     msg := err.Error()
     if strings.Contains(msg, "marshal") || strings.Contains(msg, "invalid BaseURL") {
         return false
     }
     ```
     Transient error retryability is determined by string inspection on error text rather than typed error predicates or `errors.Is`/`errors.As`.
5. **Absence of Domain Error Hierarchy**:
   - Zero sentinel errors exist across `pkg/config`, `pkg/tools`, `pkg/agent`, `pkg/session`, `pkg/protocol`, and `pkg/engine`.
   - `errors.Is` is only used for 5 standard library errors (`os.ErrNotExist`, `http.ErrServerClosed`, `context.Canceled`, `context.DeadlineExceeded`, `filepath.SkipAll`).
   - `errors.As` is only used for `*llm.LLMError` (in 2 places).
   - 100% of error unit tests across the repository verify error behavior via `strings.Contains(err.Error(), "...")` rather than `errors.Is`.
6. **Unhandled Errors**:
   - `pkg/engine/handlers.go:85,87`: `_ = c.sessionStore().Save...` silently ignores persistence errors.
   - `pkg/engine/client.go:95,120`: `_ = in.Decode(&m)` and `_ = ws.WriteMessage(...)` unhandled.
   - `pkg/tools/glob.go:73`: `_ = filepath.WalkDir(...)` error ignored.

---

## 2. Logic Chain

1. **From Observation 1 & 2**: Panic-inducing code paths (`MustMarshalPayload`, `*a.Path`, `rq.Options[0]`, `*msg`) and nil `%w` formatting reside directly in request-handling and tool-execution loops. Under unexpected payloads or missing optional arguments, they will crash the process or corrupt error chains.
2. **From Observation 3 & 4**: String-based error classification in `pkg/llm/retry.go` tightly couples the retry policy to exact error string contents. If an error message format changes, retry behavior breaks silently, leading to spurious retries of permanent errors or failure to retry transient network drops.
3. **From Observation 5**: Without typed domain errors and sentinel definitions, upper layers (`Agent`, `Engine`, `TUI`, `CLI`) cannot make semantic decisions (e.g. distinguishing user cancellation vs network timeout vs context token overflow vs parameter validation failure). Callers and unit tests are forced to rely on fragile string inspection.
4. **Conclusion**: To satisfy Requirement **R2 (Idiomatic Domain Error Handling & Type Safety)**, the codebase requires a complete domain error hierarchy specification with typed error structures and sentinel constants across all packages, combined with systematic replacement of ad-hoc strings and panic points.

---

## 3. Caveats

- **External Network Outages**: The DeepSeek API client is tested using `httptest.Server` mocks; live network testing against the real DeepSeek endpoint requires a valid `DEEPSEEK_API_KEY`.
- **Third-Party Dependencies**: Dependencies (`github.com/gorilla/websocket`, `github.com/charmbracelet/bubbletea`, `github.com/spf13/cobra`) return standard Go errors. They must be wrapped using `%w` or translated into domain errors at layer boundaries.
- **Frontend / Electron Layer**: Apps in `apps/` (e.g. Electron frontend) consume WebSocket frames from `pkg/engine` and were out of scope for Go type safety audit, though protocol alignment is preserved.

---

## 4. Conclusion

The Excelsior codebase needs an end-to-end domain error handling and type safety refactoring to achieve production-grade quality (R2). 

A comprehensive specification has been produced in `survey_report.md` detailing:
1. **`pkg/config`**: Sentinels (`ErrMissingAPIKey`, `ErrMissingModel`, `ErrInvalidBaseURL`, `ErrInvalidWorkspace`, `ErrInvalidTemperature`) + `ConfigError`.
2. **`pkg/llm`**: Sentinels (`ErrAuthFailed`, `ErrRateLimit`, `ErrServerUnavailable`, `ErrInvalidRequest`, `ErrStreamInterrupted`, `ErrLineTooLarge`, `ErrMissingAPIKey`) + `LLMError` with `ErrorKind`, `IsRetryable()`, and `Is(target)`.
3. **`pkg/tools`**: Sentinels (`ErrToolNotFound`, `ErrInvalidArguments`, `ErrPathOutsideWorkspace`, `ErrFileTooLarge`, `ErrCommandTooLong`, `ErrCommandTimeout`, `ErrTextNotFound`, `ErrAmbiguousMatch`) + structured `ToolError`.
4. **`pkg/agent`**: Sentinels (`ErrMaxIterationsReached`, `ErrContextTooLarge`, `ErrEmptyMessages`, `ErrLLMNotConfigured`, `ErrInvalidConfig`) + `AgentError`.
5. **`pkg/session`**: Sentinels (`ErrSessionNotFound`, `ErrInvalidSessionID`, `ErrCorruptedSession`, `ErrEmptySession`, `ErrStoreDirEmpty`) + `SessionError`.
6. **`pkg/protocol` & `pkg/engine`**: Elimination of `panic(err)` in `MustMarshalPayload` via safe `MarshalPayload` + `ErrUnsupportedVersion`, `ErrAlreadyStreaming`, `ErrConnectionClosed`.

All refactoring targets are enumerated and ready for execution in subsequent implementation phases.

---

## 5. Verification Method

To independently verify the observations and findings in this report:

1. **Verify Code Locations**:
   - `pkg/protocol/protocol.go:35` (`panic(err)`)
   - `pkg/tools/grep.go:53` (`fmt.Errorf("grep: %q is not a directory", *a.Path)`)
   - `pkg/engine/client.go:109` (`rq.Options[0]`)
   - `pkg/llm/retry.go:61-64` (`strings.Contains(msg, "marshal")`)
   - `pkg/config/config.go:66` (`%w` wrapping nil on invalid scheme)
2. **Run Current Test Suite**:
   ```powershell
   go test -v ./...
   ```
3. **Inspect Static Diagnostics**:
   ```powershell
   go vet ./...
   ```
