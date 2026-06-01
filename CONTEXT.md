# Excelsior Context

Excelsior is a local coding-agent workspace with terminal and desktop clients.

## Domain Vocabulary

- Workspace: a project root selected by the user. It owns sessions, settings, and the file tree shown by clients.
- Session: a chat thread inside a workspace. A session has projected transcript blocks and persisted run events.
- Turn: one user request and the agent work that follows. Completed turns are checkpointed so history can be replayed safely after interruption.
- Run: an eventful execution unit that emits typed events, supports cancellation, and can persist selected events.
- Transcript: the user-facing projection of events into chat blocks.
- Tool display: the presentation model for a tool call, including command text, status, result preview, risk, and optional file-change preview.
- File-change preview: a parsed diff model used by clients to show pending or completed edits.
- Command catalog: the available slash commands and settings shown by clients.
- Agent host: the application seam behind client actions. Clients should use package interfaces instead of importing host internals.

## Architecture Notes

- `@excelsior/core` contains shared data contracts and presentation models used by multiple clients.
- `@excelsior/client` is the client-facing host interface and must remain independent from host and app implementations.
- `@excelsior/run-runtime` owns eventful run execution and cancellation mechanics.
- `@excelsior/agent-storage` owns persistence adapters and replay policy for sessions and run events.
- TUI and desktop clients should keep rendering modules thin by moving reusable policy and model logic behind focused seams.
