# 00 — V2 Vision and Spec Index (minimal rewrite)

## Goal

Replace the current architecture — a single in-process event-sourced monolith
(`@excelsior/agent-harness` + `@excelsior/agent-host`) feeding clients a giant
polled snapshot — with a **minimal rewrite**: a TUI-only app, a daemon engine
behind a typed stdio protocol, a mutable store as the source of truth, and
clients rendering **diff-stream deltas** (no event log, no projection, no
replay). Everything that is not essential to the core product is cut, not
ported.

## Architecture at a Glance

```text
┌──────────────── client process ────────────────┐   ┌──────────────── engine process ───────────────┐
│ apps/tui (the only app)                        │   │ @excelsior/engine                            │
│        │                                       │   │  Mutate ──▶ SessionStore (durable checkpoints)│
│        └── @excelsior/client ── stdio ─────────┼──▶│  RunStore   (ephemeral, in-flight turn)      │
│        (read model from deltas,                │   │  InteractionManager, Capabilities            │
│         presentation models)                   │   │        │                                     │
│                                                │   ◀─────── DiffEmitter {scope, rev, delta}       │
└────────────────────────────────────────────────┘   └─────────────────────────────────────────────┘

@excelsior/protocol = all shared types + wire contract (absorbs the old @excelsior/core)
```

Three packages: `protocol`, `engine`, `client`. One app: `apps/tui`.

## Core Principles

1. **The store is the truth.** No event log, no projection, no replay. Loading
   a session = reading one JSON checkpoint.
2. **Committed vs in-flight.** SessionStore (durable) holds committed turns;
   RunStore (ephemeral) holds the active turn. The commit point is turn end.
3. **Protocol first.** The only boundary is the typed wire contract in
   `@excelsior/protocol`. The client has no engine types.
4. **One mutation path.** Nobody calls anything but `Mutate()`; every mutation
   produces a delta for subscribers.
5. **Cut, don't port.** Features not essential to the core product are
   deleted, not rewritten.
6. **No migration.** V2 is a clean rewrite: no porting steps, no data
   migration script. V2 starts with an empty data directory; existing JSONL
   session files are ignored. The TUI is rewritten from scratch
   (spec 11/12).

## Feature Scope

### In (the entire product)

- Run loop: send → stream text → tool-call loop; cancel via double-escape
- Tools: `view`, `ls`, `glob`, `ripgrep`, `write`, `edit`, `runCommand`,
  `askQuestion`
- Confirmations + Plan/Act modes (permission policy in the engine)
- Sessions: create / switch / delete / rename / clear, persisted as
  checkpoints
- Settings: API key, model, auto-approve edits (single hardwired provider)
- Commands: `/help`, `/clear`, `/reset`, `/settings`, `/mode`, `/session`,
  `/accept-edits`
- Diff preview for write/edit tool calls (presentation in `client`)
- While a run is active, further sends are rejected with a "busy" ack

### Cut (not ported)

| Cut | Reason |
|---|---|
| Reflection memory (`/reflect`, auto-reflection) | niche, background jobs, big surface |
| LSP diagnostics | heavy, flaky, marginal value |
| GitHub PR review (`/review`, `/review-post`) | unrelated feature |
| Inspector (`/trace`, `/replay`) | dies with event sourcing |
| Skills system (docs/agents) | prompt injection; add later |
| Subagents (`spawnSubAgent`, child processes) | biggest complexity win; no job scheduler needed |
| Task-list tool (`updateTasks`) + UI | niche, UI-heavy |
| Compaction (`/compact`) | defer |
| Revert + turn backups (`/revert`) | filesystem side-channel |
| Steering (send-while-active) | rejected with "busy" ack |
| Themes, palette, autocomplete, picker modes | UI polish |
| Provider/extension registries | one DeepSeek provider hardwired |
| Desktop app | TUI-only; desktop is a v2.1 follow-up |
| Job scheduler | no subagents/reflection/LSP → unnecessary |

## Spec Index (implement in order)

| # | File | Goal |
|---|------|------|
| 01 | `01-protocol.md` | Define `@excelsior/protocol`: all shared types, commands, deltas, sync, transports — no behavior change |
| 02 | `02-session-store.md` | Durable mutable `SessionStore` with checkpoint files replacing JSONL + projection as the read path |
| 03 | `03-mutation-path.md` | Single `Mutate()` path + `DiffEmitter` with revisions and cursors; delete `EventBus` |
| 04 | `04-run-store.md` | Ephemeral `RunStore`; run loop mutates it; turn-end commits to `SessionStore`; delete projection machinery |
| 05 | `05-interaction.md` | Confirmations/questions as store state with deltas, not Promise maps |
| 07 | `07-capabilities.md` | Tool capability context + engine-owned permission policy |
| 08 | `08-client.md` | Streaming `@excelsior/client` (sync by cursor, read model); presentation models live here |
| 09 | `09-daemon.md` | Engine as a separate process over stdio; delete `@excelsior/agent-host` |
| 10 | `10-decommission.md` | Remove legacy machinery, add protocol round-trip tests, refresh docs |
| 11 | `11-tui-architecture.md` | Define the v2 TUI: UI store, focus-routed keymaps, windowed transcript; fully rewritten |
| 12 | `12-tui-build.md` | Build the TUI incrementally in dependency order, each step green |

## Sequencing Rules

- Each spec must leave `npm run check` green on completion unless it says
  otherwise in its Acceptance section.
- Specs 01–05 and 07 are engine-internal; the client-facing snapshot may stay
  intact until 08.
- Specs 08–12 are observable: 08 changes how the app consumes state, 09
  changes process topology, 10 removes code, 11/12 rewrite the TUI.

## Definition of Done (whole effort)

- `npm run check` passes on `v2`.
- The TUI runs against a separate engine process over stdio.
- No event types, event store, projector, or replay code exists.
- No snapshot polling in the client; deltas only.
- A crash mid-run loses only the in-flight turn; all committed turns survive.
- Zero references to cut features: reflection, LSP, GitHub, skills, subagents,
  tasks, compaction, revert, themes, desktop.
- The TUI is fully rewritten (spec 11/12): store-driven, focus-routed,
  windowed; zero legacy TUI modules remain.
- No migration artifacts: no JSONL import script, no ported modules, empty
  v2 data dir.
