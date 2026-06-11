# Projection Flow

This document walks through how harness events become the transcript blocks shown by the TUI and the message history sent back to the agent loop.

## Big Picture

Projection is the read-model layer for the harness.

The harness records canonical events in `EventStore`. The projection layer replays those events into two derived views:

- `turns`: UI-facing transcript data made of `ProjectedTurn` and `ProjectedBlock` objects.
- `aiHistory`: model-facing `AgentMessage[]` history used when building future model input.

The important split is:

- events are the source of truth
- projection is disposable derived state
- snapshots are what the TUI reads

## Entry Point

Projection enters through `packages/agent-harness/src/projection.ts`.

`ProjectionCache` owns one `Projector` instance:

```ts
export class ProjectionCache {
  private projector = new Projector();

  project(events: readonly AnyHarnessEvent[]): CanonicalReadModel {
    return this.projector.project(events);
  }
}
```

The cache matters because `Projector` can apply only the newly appended events instead of replaying the full session every time.

The public helpers are:

- `projectEvents(events)`: creates a fresh cache and projects events once.
- `projectEventsToMessages(events)`: returns only `aiHistory`.
- `projectEventsToTurns(events)`: returns only `turns`.
- `projectHarnessState(input)`: combines projected read-model state with non-projected harness state such as loading state, sessions, workspace, LLM info, mode, and pending prompts.

## Snapshot Refresh

The harness refreshes the snapshot in `packages/agent-harness/src/harness.ts`.

`updateSnapshot()` reads all current events and passes them through the projection cache:

```ts
this.snapshot = projectHarnessState({
  events: this.eventStore.events,
  readModel: this.projectionCache.project(this.eventStore.events),
  isLoading: this.activeRun.isLoading(),
  sessions: this.sessionManager.sessions,
  currentSessionId: this.sessionManager.currentSessionId,
  workspace: this.workspace,
  llm: { ... },
  mode: this.mode,
  pendingConfirmation: this.confirmRouter.pendingConfirmation,
  pendingQuestion: this.confirmRouter.pendingQuestion,
});
```

So the snapshot is not manually edited by the UI path. The UI gets a fresh `HarnessSnapshot`, and the transcript part of that snapshot is always derived from events.

## Events Arrive

Events are emitted through `packages/agent-harness/src/EventBus.ts`.

`EventBus.emit()` creates a harness event, stores it in `EventStore`, emits it to extensions, and schedules a notify:

```ts
const updated = this.eventStore.recordEvent(storedEvent, session, ...);
this.extensions.emit(storedEvent);
this.notify();
```

That notify eventually calls `flushNotify()` in the harness, which calls `updateSnapshot()`, which runs projection.

The basic chain is:

```txt
agent/run code
  -> EventBus.emit(...)
  -> EventStore.recordEvent(...)
  -> harness.notify()
  -> harness.updateSnapshot()
  -> ProjectionCache.project(events)
  -> Projector.project(events)
  -> TranscriptProjection.snapshot()
  -> HarnessSnapshot
  -> TUI subscriber renders
```

## Projector

`packages/agent-harness/src/projector/Projector.ts` owns event replay.

It has three jobs:

1. Register event handlers.
2. Decide whether it can apply events incrementally.
3. Apply each new event to `TranscriptProjection`.

The handler registry is built in the constructor:

```ts
this.registerHandlers([
  new MessageHandler(),
  new ToolHandler(),
  new SubAgentHandler(),
  new ReasoningHandler(),
  new LifecycleHandler(),
]);
```

Each handler declares the event types it handles. `Projector` stores those in a `Map<HarnessEventType, ProjectionHandler>`.

When projecting, it checks whether the event array still extends the previously projected event list:

```ts
private canApplyIncrementally(events: readonly AnyHarnessEvent[]): boolean {
  if (this.appliedCount === 0) return true;
  if (this.appliedCount > events.length) return false;
  return events[this.appliedCount - 1]?.id === this.lastEventId;
}
```

If the event list was replaced, shortened, or no longer lines up with the previous last event, it resets and replays from the beginning. Otherwise it starts at `appliedCount` and only handles new events.

## Handlers

Handlers translate raw event shapes into projection actions.

The handlers live in `packages/agent-harness/src/projector/`:

- `MessageHandler.ts`
- `ToolHandler.ts`
- `ReasoningHandler.ts`
- `LifecycleHandler.ts`
- `SubAgentHandler.ts`

They do not own transcript state directly. They receive a `ProjectionContext` and call action methods on it.

For example, a message event becomes one of these actions:

- assistant message started: `projection.messages.startAssistant(...)`
- assistant delta received: `projection.messages.updateAssistant(...)`
- user message finished: `projection.messages.finishUser(...)`
- assistant message finished: `projection.messages.finishAssistant(...)`
- tool response message finished: `projection.messages.finishToolMessage(...)`

This keeps event decoding in the handler files and transcript mutation in `TranscriptProjection`.

## Projection Context

`packages/agent-harness/src/projector/types.ts` defines the interface handlers can use.

The context is grouped by domain:

- `messages`
- `tools`
- `reasoning`
- `lifecycle`
- `subAgents`

That grouping is useful because it makes handlers read like routing code. The handler decides what happened; the projection context decides how that changes transcript state.

## Transcript Projection

`packages/agent-harness/src/projector/TranscriptProjection.ts` is the stateful projection implementation.

It owns:

- `TurnStore`: the durable projected transcript turns.
- `AiHistory`: the model-facing message history.
- `LiveDrafts`: currently streaming assistant, reasoning, or tool blocks.
- `subAgentStates`: latest state for each sub-agent block.
- `displayIdCounts`: duplicate-id protection for displayed blocks.

Its `snapshot()` method returns the final read model:

```ts
snapshot(): ProjectionSnapshot {
  return {
    turns: this.drafts.materialize(),
    aiHistory: this.history.snapshot(),
  };
}
```

The important detail is that `turns` comes through `LiveDrafts.materialize()`, not directly from `TurnStore`. That means active streaming blocks can appear in the UI before they are finalized.

## TurnStore

`packages/agent-harness/src/projector/TurnStore.ts` owns the stored `ProjectedTurn[]`.

It is responsible for:

- tracking `currentTurnId`
- ensuring a turn exists
- appending or replacing blocks
- updating an existing block by id
- returning snapshot copies

When a block is finalized, it usually ends up in `TurnStore`.

Examples:

- completed user message
- completed assistant message
- completed tool call
- completed reasoning block
- compaction boundary
- error block

## LiveDrafts

`packages/agent-harness/src/projector/LiveDrafts.ts` owns in-progress display blocks.

It tracks at most one active draft of each kind:

- assistant draft
- reasoning draft
- tool draft

Streaming assistant text is a good example:

1. `MESSAGE_START` starts an assistant draft.
2. `MESSAGE_UPDATE` appends deltas to that draft.
3. `snapshot()` calls `materialize()`.
4. `materialize()` overlays the draft onto a copied turn list.
5. `MESSAGE_END` freezes the assistant block into `TurnStore`.

That lets the TUI show streaming output without permanently mutating the stored turn block on every delta.

`LiveDrafts` also flushes drafts when another block type starts. For example, starting a tool flushes the assistant draft first so the transcript stays ordered.

## AiHistory

`packages/agent-harness/src/projector/AiHistory.ts` owns the model-facing history.

It is separate from UI transcript blocks because the model does not need the same shape the TUI needs.

For example:

- user and assistant messages are appended as `AgentMessage`.
- tool calls are represented as assistant messages with `tool_calls`.
- tool responses are appended from tool-role messages.

The UI can show a rich `tool-call` block, while the model history can still receive the provider-compatible tool call/message sequence.

## Message Flow Example

A user message follows this path:

```txt
EventBus.emitUserMessage(...)
  -> MESSAGE_START
  -> MESSAGE_END
  -> MessageHandler
  -> projection.messages.finishUser(...)
  -> TranscriptProjection
  -> LiveDrafts.flushAll(...)
  -> TurnStore.upsertBlock(type: "user")
  -> AiHistory.appendMessage(...)
```

An assistant streaming response follows this path:

```txt
MESSAGE_START
  -> MessageHandler
  -> messages.startAssistant(...)
  -> LiveDrafts.startAssistant(...)

MESSAGE_UPDATE
  -> MessageHandler
  -> messages.updateAssistant(...)
  -> LiveDrafts.updateAssistant(...)

snapshot()
  -> LiveDrafts.materialize()
  -> active assistant draft appears in turns

MESSAGE_END
  -> MessageHandler
  -> messages.finishAssistant(...)
  -> LiveDrafts.finishAssistant(...)
  -> TurnStore.upsertBlock(type: "assistant", isFrozen: true)
  -> AiHistory.appendMessage(...)
```

## Tool Flow Example

Tool events are handled by `ToolHandler.ts`.

The displayed tool block id is built by `toolDisplayBlockId(event)` in `utils.ts`:

```ts
`${event.turnId ?? event.runId}:${event.data.toolCallId}`
```

That scopes provider tool-call ids by turn or run so different turns do not accidentally reuse the same display block id.

The flow is:

```txt
TOOL_EXECUTION_START
  -> ToolHandler
  -> tools.start(...)
  -> LiveDrafts.startTool(...)

TOOL_EXECUTION_UPDATE
  -> ToolHandler
  -> tools.update(...)
  -> LiveDrafts.updateTool(...)

TOOL_EXECUTION_END
  -> ToolHandler
  -> tools.finish(...)
  -> AiHistory.appendToolCall(...)
  -> LiveDrafts.finishTool(...)
  -> TurnStore.upsertBlock(type: "tool-call" or "sub-agent")
```

The final UI block is created by `toolBlockFromDraft(...)` in `utils.ts`.

If the tool is `spawnSubAgent`, the block becomes a `sub-agent` block. Otherwise it becomes a normal `tool-call` block.

## Sub-Agent Flow

Sub-agent events are handled by `SubAgentHandler.ts`.

It builds the projected sub-agent id from the parent tool call:

```ts
`${event.turnId ?? event.runId}:${event.data.parentToolCallId}`
```

That id matches the display id used for the original `spawnSubAgent` tool call.

Then it calls:

```ts
projection.subAgents.apply(...)
```

`TranscriptProjection` updates `subAgentStates` with `updateSubAgentState(...)`.

Then it tries to reflect that state into the transcript:

1. If the active tool draft is the sub-agent block, update the active draft.
2. Otherwise, update an existing frozen or stored `sub-agent` block in `TurnStore`.
3. If no block exists yet, create a fallback `spawnSubAgent` block.

The fallback path is mostly recovery for out-of-order or orphaned sub-agent events. In the normal flow, the sub-agent belongs to a parent tool call and should already map back to that parent block.

## Lifecycle Flow

Lifecycle events are handled by `LifecycleHandler.ts`.

They manage turn-level state:

- `TURN_START`: flush previous drafts, set current turn id, mark turn `in-progress`.
- `TURN_END`: flush drafts, mark turn `completed` or `interrupted`, clear current turn id.
- `HISTORY_COMPACTED`: flush drafts, reset turns, add a compaction boundary block.
- `ERROR`: flush drafts, add a frozen assistant error block, append error text to `aiHistory`, mark turn failed.

Lifecycle events are the main place where projection changes turn status rather than adding normal transcript content.

## Why Projection Has Drafts

Projection has two different kinds of state because streaming output is not the same as finalized transcript history.

`TurnStore` is for finalized or durable blocks.

`LiveDrafts` is for active blocks that are still changing.

`snapshot()` combines both:

```txt
TurnStore.snapshot()
  + active assistant/reasoning/tool draft overlays
  = turns shown by the TUI
```

This keeps the transcript responsive while preserving clean finalized blocks after events finish.

## Files To Read

Start here:

- `packages/agent-harness/src/projection.ts`
- `packages/agent-harness/src/harness.ts`
- `packages/agent-harness/src/EventBus.ts`

Then read the projection core:

- `packages/agent-harness/src/projector/Projector.ts`
- `packages/agent-harness/src/projector/TranscriptProjection.ts`
- `packages/agent-harness/src/projector/types.ts`

Then read the state helpers:

- `packages/agent-harness/src/projector/TurnStore.ts`
- `packages/agent-harness/src/projector/LiveDrafts.ts`
- `packages/agent-harness/src/projector/AiHistory.ts`
- `packages/agent-harness/src/projector/utils.ts`

Then read the handlers:

- `packages/agent-harness/src/projector/MessageHandler.ts`
- `packages/agent-harness/src/projector/ToolHandler.ts`
- `packages/agent-harness/src/projector/ReasoningHandler.ts`
- `packages/agent-harness/src/projector/LifecycleHandler.ts`
- `packages/agent-harness/src/projector/SubAgentHandler.ts`

## Mental Model

When reading projection code, follow this order:

1. What event happened?
2. Which handler owns that event type?
3. Which `ProjectionContext` action does the handler call?
4. Does that action update `TurnStore`, `AiHistory`, `LiveDrafts`, or sub-agent state?
5. Does `snapshot()` return finalized state, live draft state, or both?

That is the simplest way to navigate the projection flow without having to hold every event type in your head at once.
