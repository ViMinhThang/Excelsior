# ADR 001: JSONL Event Store with SQLite Metadata

**Status:** Accepted
**Date:** 2026-05-13

## Context

Excelsior needed an event storage layer for agent runs. Events are emitted during streaming (text deltas, tool calls, results, errors) and must be persisted for:
- Displaying conversation history on boot
- Building AI history for the model
- Crash recovery (detecting incomplete runs)
- Debugging agent behavior

The initial implementation used SQLite for everything: `sessions`, `agent_events` (all events), `runs` (run lifecycle), `workspaces`, `settings`, and `error_logs`.

## Problem

SQLite for event storage had several issues:

1. **Transaction overhead per event** — Each `INSERT` required a transaction. Batching at the end meant events were not visible during streaming, making crash recovery impossible.

2. **FOREIGN KEY constraint failures** — The `runs.session_id` → `sessions.id` FK caused cascading delete issues when sessions were removed before their runs.

3. **Complex schema** — 6 tables for what is conceptually "metadata" + "event log."

4. **No crash recovery** — If the process died mid-stream, all in-memory events were lost with no way to detect an incomplete turn.

## Decision

Split storage into two layers:

### Layer 1: Per-session JSONL files for events

```
data/sessions/{sessionId}.jsonl
```

- Each event is one JSON line, appended via `appendFileSync` during streaming
- A `TURN_COMPLETE` checkpoint event is written after each successful run
- On boot, `loadUntilLastCheckpoint()` scans for the last `TURN_COMPLETE` and discards events after it (these are from a crashed run)
- Crash-safe by construction: append-only writes cannot corrupt prior data

### Layer 2: SQLite for metadata only

SQLite keeps 3 tables:
- `sessions` — id, title, timestamps, workspace_id
- `workspaces` — id, name, root_path
- `settings` — key/value config

Removed tables: `agent_events`, `runs`, `error_logs`.

### Benefits

- **Crash safety** — Events are written to disk as they happen. A crash mid-stream loses at most one partial line.
- **Simpler schema** — No FKs, no migrations, no cascade issues.
- **No transaction overhead** — `appendFileSync` is ~10x faster than SQLite INSERT for individual events.
- **Human-readable history** — Each session is a plain text file.
- **Turn-complete detection** — `TURN_COMPLETE` checkpoint replaces FK-based integrity checks.

### Trade-offs

- **Cross-session search** — Querying across all sessions requires reading all JSONL files. If needed later, summary data can be added to `sessions.metadata`.
- **No ACID transactions across events** — JSONL is append-only with no rollback. This is acceptable because each event is independently valid and ordering is maintained by append position.
- **File system pressure** — Many concurrent sessions means many open file handles. Mitigated by per-session writes (one session streams one turn at a time).

## Consequences

1. Events are written during streaming (no batch-at-end). This changes the persistence timing but not the event schema.
2. `runStore.ts` was deleted — the `runs` table is gone. Parent-child run relationships are captured in event fields (`parentEventId`, `causationId`).
3. `agentManager.ts` now loads events per-session from JSONL instead of pre-loading all sessions' events from SQLite.
4. Session deletion becomes: delete one JSONL file + delete one SQLite row. No cascading deletes needed.
5. Existing SQLite databases with `agent_events` and `runs` tables must be migrated or deleted.
