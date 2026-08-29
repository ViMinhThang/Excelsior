## 2026-08-29T13:14:47Z
You are Explorer 1 for Milestone 1 (m1_explorer_1).
Working Directory: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m1_explorer_1
Project Scope: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\PROJECT.md
Original Request: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\ORIGINAL_REQUEST.md

Your Mission for Milestone 1:
Design the concrete domain error hierarchy, sentinel errors, and error wrapping implementations for:
1. `pkg/config`: `ErrMissingAPIKey`, `ErrMissingModel`, `ErrInvalidBaseURL`, `ErrInvalidWorkspace`, `ErrInvalidTemperature`, `ConfigError` with `errors.Is`/`errors.As`/`Unwrap()`. Fix nil wrapping in `config.go`.
2. `pkg/llm`: `ErrAuthFailed`, `ErrRateLimit`, `ErrServerUnavailable`, `ErrInvalidRequest`, `ErrStreamInterrupted`, `ErrLineTooLarge`, `ErrMissingAPIKey`, `LLMError` with `ErrorKind`, `IsRetryable()`, `Unwrap()`, `Is(target)`. Fix `retry.go` to use typed `LLMError.IsRetryable()` instead of `strings.Contains`.
3. `pkg/tools`: `ErrToolNotFound`, `ErrInvalidArguments`, `ErrPathOutsideWorkspace`, `ErrFileTooLarge`, `ErrCommandTooLong`, `ErrCommandTimeout`, `ErrTextNotFound`, `ErrAmbiguousMatch`, `ToolError` with `Op`, `Tool`, `Err`, `Unwrap()`, `Is(target)`.

Provide exact code blueprints, file paths, function signatures, and migration steps for existing call sites.
Write your analysis and plan to `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m1_explorer_1\analysis.md` and `handoff.md`.
Notify orchestrator when done.
