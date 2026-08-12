# Excelsior Context

Excelsior is a local coding-agent workspace with a terminal client driven by a persistent engine daemon.

## Domain Vocabulary

- Workspace: a project root selected by the user. The engine is bound to one workspace per process and owns its sessions, settings, and file tree.
- Session: a chat thread inside a workspace. A session has persisted state, committed transcript blocks, and an interaction slot (pending confirmation or question).
- Turn: one user request and the agent work that follows. Completed turns are checkpointed so history can be replayed safely after interruption.
- Run: an eventful execution unit that emits typed deltas, supports cancellation, and commits its transcript blocks when finished.
- Transcript: the committed projection of turns into user, assistant, and tool-call blocks stored with the session.
- Tool display: the presentation model for a tool call, including status, result preview, and risk.
- File-change preview: a parsed diff model used by clients to show pending or completed edits.
- Command catalog: the slash commands and settings surfaced by the engine.
- Engine daemon: the stdio process hosting `createEngine`. Clients should never import engine internals.
- Agent client: the client-facing host interface in `@excelsior/client`; clients drive the engine through it over the transport.

## Architecture Notes

- `@excelsior/protocol` contains the wire contract (v2 envelopes, commands, requests, deltas, snapshots) and the transports (stdio, in-process). It has zero dependencies and must stay dependency-free.
- `@excelsior/engine` owns the daemon assembly: session and run stores, the mutation path, interaction manager, capability policies, sync service, responder, and the turn executor (ai-sdk `streamText` with DeepSeek). The entrypoint wires it to stdio.
- `@excelsior/engine` also owns tools, permissions (plan/act modes), and settings persistence. Clients receive everything as protocol deltas.
- `@excelsior/client` is the client-side host: read model, agent client, and presentation. It must remain independent from engine and app implementations.
- TUI and desktop clients should keep rendering modules thin by moving reusable policy and model logic into `@excelsior/client` or `@excelsior/engine`.
- The v1 legacy stack (harness, host, core packages, reflection, LSP, GitHub integration, skills, subagents, compaction) was decommissioned in v2; `scripts/check-boundaries.mjs` bans references to it.

## Specs

The v2 build is driven by numbered specs in `docs/` (00-vision through 12-tui-build), each with an acceptance checklist.
