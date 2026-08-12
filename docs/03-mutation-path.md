# 03 — Single Mutation Path (`Mutate` + `DiffEmitter`)

## Goal

Replace the free-for-all `EventBus.emit` with **one mutation path**: every
state change goes through a single `Mutate()` entry point that updates the
store and emits a typed delta with a monotonic revision. Delete
`EventBus`/`EventStore` and the JSONL event log after the run loop is moved
onto the new path (spec 04).

## Motivation

Today `EventBus.emit` (`packages/agent-harness/src/events/EventBus.ts`) does
six jobs per call — event construction, session resolution, persistence,
session-metadata mutation, extension hooks, notification — and any module can
call it at any time. There is no invariants boundary and no notion of
"revision", so clients cannot resume or dedupe. `Mutate()` + `DiffEmitter`
restores ownership: mutations are the only way state changes; deltas are the
only way it leaks out.

## Scope

- `Mutate()` in `@excelsior/engine`: accepts a mutation (discriminated union),
  applies it to `SessionStore` (and later `RunStore`), bumps the scope
  revision, and emits a delta.
- `DiffEmitter`: per-scope revision counters + subscriber fan-out +
  ring buffer of recent deltas for resume (spec 08 consumes it).
- Delete `EventBus`, `EventStore`, `JsonlEventRepository`,
  `InMemoryEventRepository`, `events.ts` harness event types, and the
  `ExtensionRegistry`.

**Non-goals:** the ephemeral `RunStore` (spec 04), interaction state
(spec 05), client sync (spec 08).

## Design

### Mutations

```ts
type Mutation =
  | { kind: "session-create"; title?: string }
  | { kind: "session-switch"; sessionId: string }
  | { kind: "session-delete"; sessionId: string }
  | { kind: "session-rename"; sessionId: string; title: string }
  | { kind: "session-clear" }
  | { kind: "blocks-commit"; sessionId: string; blocks: TranscriptBlock[] }
  | { kind: "mode-set"; mode: AgentMode }
  | { kind: "settings-save"; patch: Partial<AppSettings> }
  | { kind: "meta-refresh" };       // sessions list / workspace / llm changed
```

(`run-*` mutations are added in spec 04; `interaction-*` in spec 05.)

### Mutate

```ts
interface Mutate {
  (mutation: Mutation): void;
  // synchronous, never throws for domain reasons; failures return a typed error delta
}
```

- `Mutate` is the **only** exported way to change engine state. Modules that
  previously called `eventBus.emit(...)` now call `mutate(...)`. Anything that
  needs to react to a change subscribes to `DiffEmitter`, it never mutates.
- Validation: each mutation handler validates inputs (session exists, etc.)
  and returns either a commit (state changed → revision bumped, delta emitted)
  or a no-op with an error delta.
- Ordering: mutations apply synchronously in call order; deltas are emitted
  after the mutation is committed, in the same tick, with strictly increasing
  revisions per scope.

### DiffEmitter

```ts
interface DiffEmitter {
  subscribe(listener: (delta: WireDelta) => void): () => void;
  lastRev(scope: DeltaScope): number;
  deltasSince(scope: DeltaScope, cursor: number): WireDelta[]; // ring buffer, null if gap
  emit(scope: DeltaScope, delta: WireDelta): void;
}
```

- Ring buffer per scope (default 1000 deltas). A consumer asking
  `deltasSince(scope, cursor)` where the cursor fell out of the buffer gets
  `null`, signalling "resync from snapshot" (spec 08).
- `WireDelta` is the `AgentDelta` type from `@excelsior/protocol` — the
  engine's internal emitter is the protocol type, so nothing is re-mapped at
  the boundary.

### Interim wiring (until spec 04)

- Session-level mutations (`session-*`, `settings-save`, `mode-set`) move onto
  `Mutate` immediately.
- The run loop keeps emitting its `events.ts`-style events internally for the
  active-turn projection **only**; turn commit already lands in `SessionStore`
  via `blocks-commit` (from spec 02).
- `EventBus`/`EventStore`/repositories and harness event types are deleted
  only when spec 04 removes their last consumer.

## Steps

1. Add `Mutation` union + `Mutate` implementation over `SessionStore`.
2. Add `DiffEmitter` with revisions + ring buffer; unit-test gap semantics.
3. Migrate session/settings/mode mutations from `EventBus` to `Mutate`.
4. Delete `EventBus`, `EventStore`, `events/MessageComposer`, harness event
   types (`events.ts`), repositories, and `ExtensionRegistry` — after moving
   the last run-loop emitter to a local stream.
5. Update the architecture boundary test to forbid imports of the deleted
   modules (temporary guard until spec 10 removes the regex tests).

## Acceptance Criteria

- Zero calls to `EventBus.emit` remain; `Mutate` is the only mutation entry.
- `DiffEmitter` emits exactly one delta per committed mutation, revisions are
  monotonic per scope, and `deltasSince` returns `null` on buffer gap.
- Session switching, settings save, and mode toggle behave identically in the
  TUI (behavior tests cover these after the change).
- `npm run check` passes; unused-code check has no remaining references to the
  deleted modules.
