## 2026-08-29T13:17:29Z

You are the Specialist Implementation Worker for Milestone 1 (m1_worker).
Working Directory: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m1_worker
Project Scope: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\PROJECT.md
Original Request: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\ORIGINAL_REQUEST.md

Specifications to read and follow:
- `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m1_explorer_1\analysis.md`
- `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m1_explorer_2\analysis.md`
- `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m1_spec_miner\spec.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks for Milestone 1:
1. Implement domain error types, sentinels, and wrapping across all 7 core packages:
   - `pkg/config`: `errors.go`, update `config.go` (fix nil `%w` bug), update `config_test.go` with `errors.Is(err, config.Err...)`.
   - `pkg/llm`: `errors.go`, update `client.go`, `retry.go` (refactor from `strings.Contains` to typed `LLMError.IsRetryable()`), update `*_test.go` with `errors.Is(err, llm.Err...)`.
   - `pkg/tools`: `errors.go`, update `grep.go` (fix nil `*a.Path` bug), `glob.go` (fix walk error ignore), `bash.go`, `edit.go`, `view.go`, `write.go`, `ls.go`, `ask.go`, update `*_test.go` with `errors.Is(err, tools.Err...)`.
   - `pkg/agent`: `errors.go`, update `agent.go` (fix nil `*msg` bug at line 190), update `agent_test.go` with `errors.Is(err, agent.Err...)`.
   - `pkg/session`: `errors.go`, update `session.go` (map `os.ErrNotExist` to `ErrSessionNotFound`), update `session_test.go` with `errors.Is(err, session.Err...)`.
   - `pkg/protocol`: `errors.go`, update `protocol.go` (eliminate panic in `MustMarshalPayload`, add `MarshalPayload(v any) (json.RawMessage, error)`), update `protocol_test.go` with `errors.Is(err, protocol.Err...)`.
   - `pkg/engine`: `errors.go`, update `client.go` (fix `rq.Options[0]` panic on empty options slice), `handlers.go`, update `*_test.go` with `errors.Is(err, engine.Err...)`.
2. Ensure every custom error implements `Error() string`, `Unwrap() error`, and `Is(target error) bool` where applicable.
3. Run verification:
   - `go build ./...`
   - `go vet ./...`
   - `go test -v ./...`
4. Document all changes, files modified, verification commands, and outputs in `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m1_worker\changes.md` and `handoff.md`.
5. Send completion message back to orchestrator (conversation ID: 8884cc3c-d4d3-4cb8-91b1-a31965788d96).
