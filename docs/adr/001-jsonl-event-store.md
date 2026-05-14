# ADR 001: JSONL Event Store with SQLite Metadata

**Status:** Accepted  
**Date:** 2026-05-13  
**Updated:** 2026-05-14

## Context

Excelsior emits runtime events while agents stream text, call tools, spawn sub-agents, retry, fail, or cancel. Those events must support:

- displaying conversation history on boot
- building model history for later turns
- detecting and trimming incomplete crashed turns
- debugging agent behavior

SQLite remains useful for metadata, but it is not the best fit for high-frequency streaming event appends.

## Decision

Use two persistence layers:

1. **JSONL event files** at `data/sessions/{sessionId}.jsonl`
   - One runtime event per line.
   - `RunRecorder` owns appending parent events, child events, and `TURN_COMPLETE` checkpoints.
   - Normal session restore uses checkpoint-safe loading through `loadSessionEvents()`.
   - Raw loading is available only for debugging and tests through `loadRawSessionEvents()` / `RunRecorder.loadRawEvents()`.

2. **SQLite metadata**
   - `sessions` stores id, title, timestamps, workspace id, and metadata.
   - `workspaces` stores workspace identity and root path.
   - `settings` stores local configuration values.
   - `error_logs` stores bootstrap/runtime errors.

## Consequences

- Event persistence has one boundary: `RunRecorder`.
- A crashed or interrupted run can leave partial events after the last `TURN_COMPLETE`; normal restore excludes those events.
- Debug tooling can still inspect raw event files when needed.
- Cross-session search requires reading JSONL files or adding summary metadata later.
- Session deletion removes the SQLite row and the session JSONL file.
