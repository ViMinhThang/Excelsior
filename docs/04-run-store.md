# 04 — Ephemeral RunStore + Turn-End Commit

## Goal

Move the **active run** out of the event/projection machinery into an
ephemeral in-memory `RunStore` that the run loop mutates directly, and make
**turn end the commit point**: the finalized turn folds into `SessionStore`
as `TranscriptBlock`s. Delete the projector, projection cache, and
`AiHistory` machinery.

## Motivation

The current active turn is streamed through `events.ts` events → `Projector` →
`LiveDrafts` + `TurnStore`, a double pipeline that exists only to reconstruct
what a mutable store could hold directly. Committed turns already live in
`SessionStore` (spec 02); the run store completes the picture by holding the
in-flight turn as plain mutable state.

## Scope

- `RunStore` in `@excelsior/engine`: in-memory, holds the single active run.
- `RunController`/`RunStepRecorder` mutate `RunStore` instead of emitting
  events; `ProgressBatcher` feeds `run-text-delta`/`run-tool` deltas.
- Turn-end commit: convert the completed `RunTurn` into `TranscriptBlock[]`,
  `blocks-commit` into `SessionStore`, checkpoint.
- `AiHistory` becomes a derived view over `SessionStore.blocks` + the active
  run's model-visible messages (small pure function; no projection).
- Cancel: the turn commits with status `interrupted`; open tool calls marked
  `error/denied`.
- Delete `Projector`, `TranscriptProjection`, `LiveDrafts`, `TurnStore`,
  `AiHistory`, projection handlers (`MessageHandler`, `ToolHandler`,
  `LifecycleHandler`, `TaskHandler`), `ProjectionCache`, and the snapshot
  builder's projection overlay.

**Non-goals:** interaction state (spec 05), client read models (spec 08).
Sub-agent blocks, steering, and compaction are cut — the run store does not
model them.

## Design

### RunStore

```ts
interface RunTurn {
  id: string;
  sessionId: string;
  status: "running" | "committing" | "committed" | "cancelled" | "failed";
  userContent: string;
  displayContent?: string;
  steps: RunStep[];            // model steps this turn
  blocks: DraftBlock[];        // streaming blocks (text / tool-call)
  error?: string;
  startedAt: number;
}

interface RunStep {
  id: string;
  modelOutput: string;         // accumulated text from the model step
  toolCalls: RunToolCall[];
}

interface RunToolCall {
  id: string;
  toolName: string;
  args: unknown;
  status: "streaming-input" | "executing" | "done" | "error" | "denied";
  result?: string;             // accumulated streamed result
  isError?: boolean;
}
```

No steering queue: while a run is active, `send` is rejected with a `busy`
ack (spec 01). No sub-agent state.

New run-related mutations (added to the `Mutation` union from spec 03):

```ts
| { kind: "run-begin"; turn: RunTurn }
| { kind: "run-text"; turnId: string; content: string }        // model text delta
| { kind: "run-tool-start"; turnId: string; call: RunToolCall }
| { kind: "run-tool-update"; callId: string; result: string }
| { kind: "run-tool-end"; callId: string; result: string; isError?: boolean }
| { kind: "run-commit"; turnId: string }                        // → blocks-commit internally
| { kind: "run-cancel"; turnId: string; reason?: string }
| { kind: "run-fail"; turnId: string; error: string }
```

Deltas for clients: `run-text-delta`, `run-tool`, `run-status`, and
`block-committed` (when a turn commits) — all already defined in spec 01.

### Run loop changes

- `runModelStep` writes model deltas into `RunStore` (via `Mutate`) and
  streams them out as `run-*` deltas. No harness event types, no
  `RunEventWriter` (its logic inlines into the recorder).
- Tool execution reads/writes `RunToolCall`; `TOOL_EXECUTION_*` events are
  gone.
- Cancellation (today: `ActiveRunManager.abort()` + `finalizeCancelled`
  emitting synthetic close events) becomes: `run-cancel` mutation → the turn
  commits with status `interrupted`, open tool calls marked `error/denied`,
  then `blocks-commit`. `findIncompleteEvents` is deleted; there is nothing
  "incomplete" left.
- Sending while active: `RunOrchestrator.send` checks `runStore.isActive()`
  and returns a `busy` ack instead of steering.

### AiHistory (replacement)

```ts
function buildAiHistory(
  committed: SessionState,
  active: RunTurn | null,
  settings: AppSettings,
): AgentMessage[];  // pure; user msgs, assistant texts, tool call/result pairs
```

`buildAiHistory` replaces `projectionCache.project(...).aiHistory` as the
model-context input at context-build time. No compaction: history grows
unbounded in v2 (a cut feature).

### Snapshot builder

`HarnessSnapshot`/`AgentClientState` composition changes to:

```ts
{
  turns: blocksToTurns(sessionStore.load(sessionId)),   // committed
  liveDraft: runStore.activeTurn,                        // streamed in as blocks
  ...
}
```

The client-visible shape is unchanged until spec 08, so the app does not
change.

## Steps

1. Add `RunStore` + `run-*` mutations + delta emission.
2. Rewire `RunController`/`runModelStep`/`RunStepRecorder` onto the store;
   delete `RunEventWriter`, `ProgressBatcher` (inlined), `ActiveRunManager`
   finalization logic; replace steering with the busy ack.
3. Implement `buildAiHistory`; replace projection-based history at context
   build time.
4. Rebuild snapshot from store + active turn; delete projector/handlers/
   `ProjectionCache` and the projection tests, replacing them with
   `RunStore`/`buildAiHistory` tests.
5. Port cancellation onto the new mutations; update
   `activeRun.test.ts`/`runController.test.ts` to the new seams.

## Acceptance Criteria

- No module imports `projection/` or emits harness events; the snapshot
  builder is a pure function of `SessionStore` + `RunStore`.
- Streaming text, tool progress, cancellation, and the busy-ack behave
  identically in the TUI (existing harness/projection tests replaced by
  equivalent store-level tests).
- A turn that ends `committed` is immediately durable: kill the process right
  after the commit delta and restart — the turn is present.
- `npm run check` passes.
