# 02 — Durable SessionStore (checkpointed mutable state)

## Goal

Replace the JSONL event log + projection as the **persistence and read path**
for sessions with a durable, mutable `SessionStore` that checkpoints
committed session state to JSON snapshot files. Loading a session becomes
"read one file", with no event replay.

## Motivation

The event log only ever reconstructs the transcript — live state (active run,
confirmations, mode) lives in memory and dies on crash, so event sourcing
costs complexity without delivering recovery. The finalized transcript is the
only durable part, so it should be stored directly as state, not derived by
replay.

## Scope

- New `SessionStore` in `@excelsior/engine`.
- Checkpoint persistence: one JSON file per session.
- `TranscriptBlock`/`SessionState` types in `@excelsior/protocol` (spec 01).
- Harness commits finalized turns into the store; the snapshot builder reads
  the transcript from the store.

**Non-goals:** in-flight run state (spec 04), the `Mutate()` path (spec 03),
deleting `EventStore`/`JsonlEventRepository` (spec 10). Projection stays alive
for the *active* turn until spec 04 lands.

## Design

### TranscriptBlock (the stored unit)

Port the final block shapes from `ProjectedTurn`/`ProjectedBlock`
(`packages/agent-harness/src/projection/types.ts`) into `@excelsior/protocol`
as immutable value types. The stored session is a list of these blocks, in
order:

```ts
interface TranscriptBlock {
  id: string;                 // stable across checkpoints (e.g. msg_xxx / tool_xxx)
  turnId: string;
  kind: "user" | "assistant" | "tool-call" | "system";
  role?: "user" | "assistant";
  content: string;            // finalized text
  tool?: ToolCallBlock;       // for tool-call blocks
  status: "completed" | "interrupted" | "failed";
  createdAt: number;
  finalizedAt: number;
}
```

`TranscriptBlock` is the wire shape too (spec 01 deltas carry it), so client
and engine share one definition. No sub-agent or task block kinds.

### SessionState

```ts
interface SessionState {
  session: Session;             // id, title, timestamps (from protocol)
  blocks: TranscriptBlock[];    // committed transcript, append-only
  interaction: InteractionState; // pending confirmation/question (spec 05)
  lastTurnId: string | null;
}
```

### Persistence format

```text
<data>/sessions/<workspaceId>/<sessionId>.json
{
  "version": 2,
  "session": { ... },
  "blocks": [ ... ],
  "interaction": { ... },
  "lastTurnId": "...",
  "updatedAt": 1234567890
}
```

Rules:

- **Atomic writes:** write to `*.json.tmp`, then `fs.rename`. Never partially
  overwrite a checkpoint.
- **Debounced:** at most one write per session per ~250 ms; flush pending on
  process exit (`beforeExit`/`SIGTERM`).
- **Corruption:** if a checkpoint fails to parse, move it to
  `<sessionId>.json.broken` and surface a recoverable error; never crash.
- **Prune:** keep only the latest checkpoint per session.

### API

```ts
class SessionStore {
  load(sessionId: string): SessionState | null;
  list(): Session[];                       // session metadata only
  create(title: string): SessionState;
  delete(sessionId: string): void;
  rename(sessionId: string, title: string): void;
  clear(sessionId: string): void;          // /clear, /reset
  appendBlocks(sessionId: string, blocks: TranscriptBlock[]): void; // commit
  checkpoint(sessionId: string): void;     // force flush (used at commit points)
}
```

The store is a thin wrapper over an in-memory map + debounced writer. All
writes go through the `Mutate()` path from spec 03.

### Turn commit (interim wiring, before spec 04)

- At `TURN_END` in the run loop, take the finalized turn from projection
  (`TurnStore`), convert it to `TranscriptBlock[]`, and call
  `sessionStore.appendBlocks(...)` + `checkpoint()`.
- The snapshot builder reads committed blocks from `SessionStore` and overlays
  the active turn from projection (unchanged) — visual behavior identical.
- `/clear` and `/reset` become `store.clear(sessionId)` /
  `deleteAllSessions()`.

### One-time migration

None. V2 starts with an empty data directory (no-migration principle,
spec 00). Pre-existing `<sessionId>.jsonl` files from the old harness are
ignored and never read; they are deleted with the legacy code in spec 10.

## Steps

1. Add `TranscriptBlock`/`ToolCallBlock`/`SessionState` to `@excelsior/protocol`.
2. Create `@excelsior/engine` package with `SessionStore` + checkpoint writer.
3. Wire turn-commit into the run loop; snapshot reads committed blocks from the
   store.
4. Port `/clear`, `/reset` onto the store.
5. Tests: checkpoint round-trip, atomic write, debounce/flush, corrupt-file
   handling.

## Acceptance Criteria

- New sessions persist only as `.json` checkpoints; nothing writes `.jsonl`
  (v2 data dir starts empty).
- A kill (`SIGKILL`) after a completed turn, followed by restart, shows all
  committed turns (this is the new crash guarantee — test it).
- `npm run check` passes.
