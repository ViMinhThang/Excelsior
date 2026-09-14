# `apps/electron/lib/engineState.ts`

Pure reducer: `WireMessage` → `EngineState` → React blocks. No socket, no storage, no side effects.

## State

`EngineState` is per-session maps keyed by `sessionId`, plus global `workspace/status/sessions/error`:

* `blocksBySession`: rendered chat (`user/assistant/reason/tool/error`). `tool` uses `meta=toolName`, `content=result`, `args=streamed args`. `args===undefined` = still streaming.
* `runIds` + `streamingBySession`: liveness. Set on `session.data{running,runId}`, cleared on `done`. Gates all live updates.
* `asksBySession/permsBySession`: at most one pending dialog per session.
* `usageBySession/outcomes/activeId/allowAll/refreshList`: token totals, terminal `done`, selected session, settings flag, list-refresh counter.

## Entry

`reduce(state, action)` handles `reset/status/active/error` directly, delegates `server` to `reduceServer`.

`reduceServer`:

1. `auth` → ignore.
2. `workspace.set` → `switchWorkspace()` — mismatch wipes all session maps, keeps `status`.
3. `msg.workspace !== state.workspace` → drop stale workspace.
4. `serverHandlers[type]` table lookup, else ignore.

`isLiveRun(sid,runId)` = `runIds match && streaming`. `delta/ask.req/permission.req` drop if not live. `done/interaction.done` drop if `runId` mismatch.

## Snapshot (`session.data`)

`applySnapshot`: base (`activeId/runId/usage/outcome` reset + `clearInteractions`) → `snapshotBlocks(messages)` → replay `events` via `applyDelta` → `withStreaming(running)` → `applyPending` → `applyOutcome` → `projectionUnavailable` error block.

`snapshotBlocks`: `collectToolArgs` builds `toolCallId→args` map, `isDisplayable` drops `system` + empty-assistant-with-tool_calls, `messageToBlock` maps `tool/user→as-is`, rest→`assistant`.

## Delta (streaming)

`applyDelta` → `deltaHandlers` table:

* `text/reasoning/error` → `appendBlock` (merge if same `role+meta`, else push).
* `tool_start` → `appendToolArgs` (append to unfinished tool, else new block).
* `tool_result` → `completeTool` (move `content→args`, set result, else orphan block with `meta: "name →"`).
* `generation/done` → `addUsage` (accumulate tokens, no-op if all zero).
* unknown → `withStreaming(true)`.

## Helpers (immutable)

`withBlocks/withStreaming/clearInteractions/withoutKey/appendBlock` — all copy-on-write, `delete` = stop streaming / clear dialog.
