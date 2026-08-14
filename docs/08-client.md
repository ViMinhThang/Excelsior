# 08 — Streaming Client (`@excelsior/client` read models)

## Goal

Replace snapshot polling with a **streaming client library**: the TUI
connects over a `Transport` (spec 01), syncs by cursor, applies deltas to a
local read model, and subscribes to slices. `AgentHost.dispatch`/
`AgentClientState` polling disappears from the app, and the presentation
models (tool display, diff preview) move into `client` from the old `core`.

## Motivation

Today every event re-serializes a full `AgentClientState` (transcript, tasks,
sessions, mode, interactions, reflection) and the app re-renders on it.
Nothing scales, nothing resumes. A read model with cursor-sync gives
incremental rendering and reconnect/resume in one place.

## Scope

- `@excelsior/client`: `AgentClient` (connect → sync → read model → commands),
  cursor bookkeeping, slice subscriptions, React bindings.
- Presentation models move here from `core`: `createToolDisplay`,
  `fileChangePreviewParser`, `fileChangePreviewFrame`, tool args/text/progress
  helpers (the `conversationPresentation/` tree).
- Port the TUI off `agent-host`/`dispatch` onto `AgentClient` (in-process
  transport for now; spec 09 moves the wire).
- Delete `hostActions.ts`, `hostContract.ts` usage from the app, and the
  snapshot-poller hooks.

**Non-goals:** process split (spec 09), changing UI visuals, removing
`agent-host` package (spec 09), desktop (cut).

## Design

### AgentClient

```ts
class AgentClient {
  constructor(transport: Transport);
  connect(): Promise<void>;        // sends initial syncs
  syncAll(): Promise<void>;        // full resync: meta + catalog + current session
  subscribe<S extends SliceKey>(key: S, listener: (slice: ReadModel[S]) => void): () => void;
  getSlice<S extends SliceKey>(key: S): ReadModel[S];
  command(cmd: AgentCommand): Promise<CommandAck>;
  onSessionChanged(cb: (sessionId: string | null) => void): () => void;
  close(): void;
}
```

### Read model and sync

```ts
interface ReadModel {
  meta: { sessions: Session[]; currentSessionId: string | null; workspace: Workspace; llm: AgentLlmInfo; mode: AgentMode };
  catalog: { commands: CommandDefinition[]; settings: AppSettings };
  session: { blocks: TranscriptBlock[]; interaction: InteractionState } | null;
  run: { status: RunStatus; turnId: string | null; items: RunItem[] } | null;
}
```

No tasks, no jobs, no reflection slices — cut features.

- On connect: `sync {scope: "meta"}`, `sync {scope: "catalog"}`, `sync
  {scope: "session"}`, `sync {scope: "run"}`.
- `sync` reply is a `session-state` delta with the scope's current `rev`; the
  client then applies pushed deltas. If the client's cursor is stale beyond
  the ring buffer, the server sends a fresh snapshot delta (the client just
  replaces the slice).
- Every `AgentDelta` maps to one slice update; slice listeners fire only when
  their slice changes — a `run-text-delta` touches only `run`.
- Transcript rendering: committed `blocks` + live `run` overlay (exactly the
  split from spec 02/04), assembled by a pure function in `client`.
- After `settings-save`, refetch the `catalog` slice via the `catalog` request.

### React bindings

- `AgentClientProvider` + `useAgentClient()` + `useSlice(key)`.
- The v2 TUI (spec 11/12) is fully rewritten and consumes slices through its
  own UI store; it does not reuse any current TUI hooks.

### Consuming in the v2 TUI

The TUI does not render from `AgentClient` directly — `engine/` in the TUI
folds deltas into the UI store's slices (`docs/11-tui-architecture.md`):

1. `client.subscribe` → delta stream → `foldDeltas` maps each `AgentDelta`
   onto the matching store slice (`meta`, `catalog`, `session`,
   `run`).
2. The transcript slice feeds the windowed list: committed blocks are
   immutable; the run slice is the live overlay at the tail
   (`transcript/window.ts`).
3. Commands are the only way out: `submitPipeline` routes input to
   `client.command()`; overlays (confirm/question) call the corresponding
   commands.
4. Reconnect after engine restart: `client.syncAll()` refills slices by
   cursor — committed state is lossless.

## Acceptance Criteria

- The app does not import `@excelsior/agent-host` or dispatch
  `AgentHostIntent`.
- A long streaming turn updates only the `run` slice per delta; transcript
  blocks update once per committed turn (assertable via listener counters in
  tests).
- Reconnect after a server restart: meta/session/catalog resync, run slice
  resets, transcript intact.
- Presentation tests from `core` move to `client` unchanged; `npm run check`
  passes.
