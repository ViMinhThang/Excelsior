## 2026-08-29T13:14:47Z
You are Explorer 2 for Milestone 1 (m1_explorer_2).
Working Directory: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m1_explorer_2
Project Scope: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\PROJECT.md
Original Request: c:\Users\huynh\OneDrive\Desktop\projects\excelsior\ORIGINAL_REQUEST.md

Your Mission for Milestone 1:
Design the concrete domain error hierarchy, sentinel errors, and panic elimination for:
1. `pkg/agent`: `ErrMaxIterationsReached`, `ErrContextTooLarge`, `ErrEmptyMessages`, `ErrLLMNotConfigured`, `ErrInvalidConfig`, `AgentError` with `Unwrap()`, `Is(target)`. Fix nil pointer dereference on `*msg` in `agent.go:190`.
2. `pkg/session`: `ErrSessionNotFound`, `ErrInvalidSessionID`, `ErrCorruptedSession`, `ErrEmptySession`, `ErrStoreDirEmpty`, `SessionError` with `Unwrap()`, `Is(target)`.
3. `pkg/protocol`: Remove `panic(err)` from `MustMarshalPayload`, add safe `MarshalPayload(v any) (json.RawMessage, error)`, define `ProtocolError` and sentinels (`ErrUnsupportedVersion`, `ErrInvalidPayload`, `ErrCorruptEnvelope`).
4. `pkg/engine`: `ErrAlreadyStreaming`, `ErrConnectionClosed`, `ErrClientDisconnected`, `EngineError` with `Unwrap()`, `Is(target)`.

Provide exact code blueprints, file paths, function signatures, and migration steps for existing call sites.
Write your analysis and plan to `c:\Users\huynh\OneDrive\Desktop\projects\excelsior\.agents\m1_explorer_2\analysis.md` and `handoff.md`.
Notify orchestrator when done.
