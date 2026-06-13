# Excelsior Context

Excelsior is a local coding-agent workspace with terminal and desktop clients.

## Domain Vocabulary

- Workspace: a project root selected by the user. It owns sessions, settings, and the file tree shown by clients.
- Session: a chat thread inside a workspace. A session has projected transcript blocks and persisted run events.
- Turn: one user request and the agent work that follows. Completed turns are checkpointed so history can be replayed safely after interruption.
- Run: an eventful execution unit that emits typed events, supports cancellation, and persists every harness event.
- Transcript: the user-facing projection of events into chat blocks.
- Tool display: the presentation model for a tool call, including command text, status, result preview, risk, and optional file-change preview.
- File-change preview: a parsed diff model used by clients to show pending or completed edits.
- Language diagnostics: lazily collected language-server feedback attached to file tool results after the agent reads or edits a supported source file.
- Command catalog: the available slash commands and settings shown by clients.
- Agent host: the adapter behind client actions. Clients should use package interfaces instead of importing host internals.

## Architecture Notes

- `@excelsior/core` contains shared data contracts and presentation models used by multiple clients.
- `@excelsior/client` is the client-facing host interface and must remain independent from host and app implementations.
- `@excelsior/agent-harness` owns runtime execution, event storage, settings, sessions, registries, confirmation/question state, and projection to `AgentClientState`.
- `@excelsior/agent-harness` also owns language diagnostics; clients receive them as ordinary tool result text rather than managing language-server processes.
- `@excelsior/agent-host` is a thin adapter layer that exposes `HarnessAgentHost`, default host creation, and runtime initialization for app clients.
- TUI and desktop clients should keep rendering modules thin by moving reusable policy and model logic into `@excelsior/core` or `@excelsior/agent-harness`.
