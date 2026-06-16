# Active Run Flow

This document explains how the harness tracks an active run, accepts steering messages during that run, handles double-Esc cancellation, and finalizes partially streamed output when a run is aborted.

## Big Picture

`ActiveRunManager` is the harness component that answers one question: is there a run currently in flight, and if so, how should new user input or cancellation affect it?

The important behaviors are:

- a normal send starts a new active run
- a send during an active run becomes steering for the current run
- steering is drained between model tool-loop steps
- cancellation aborts the active run signal
- pending confirmations/questions are denied or cancelled
- incomplete assistant/tool events are finalized so projection does not leave dangling blocks

The high-level path for a normal run is:

```text
HarnessStore.send receives user input
  -> ActiveRunManager.begin creates run handle and AbortSignal
  -> RunController.run executes model/tool loop
  -> RunController drains steering messages between steps
  -> finally activeRun.finish clears the active handle
  -> snapshot is refreshed with isLoading false
```

The high-level path for input during a run is:

```text
HarnessStore.send receives user input while active
  -> ActiveRunManager.acceptSteering validates and queues it
  -> EventBus emits a visible user message into the current turn
  -> RunController drains queued steering before the next model step
```

The high-level path for cancellation is:

```text
UI dispatches cancel
  -> HarnessAgentHost calls harness.cancel()
  -> ActiveRunManager.abort aborts the run signal
  -> ConfirmationRouter.cancelAll resolves pending prompts
  -> ActiveRunManager.finalizeCancelled closes incomplete events
  -> ActiveRunManager.clear removes active handle
  -> snapshot is refreshed with isLoading false
```

## ActiveRunManager State

The implementation lives in `packages/agent-harness/src/run/ActiveRunManager.ts`.

It tracks:

```ts
private current: InternalActiveRunHandle | null = null;
private steeringQueue: string[] = [];
private readonly finalizedRunIds = new Set<string>();
```

The active run identity is:

```ts
export interface ActiveRunIdentity {
  runId: string;
  turnId: string;
  sessionId: string;
}
```

The active handle adds an `AbortSignal`:

```ts
export interface ActiveRunHandle extends ActiveRunIdentity {
  signal: AbortSignal;
}
```

Internally, the manager stores the matching `AbortController` so `abort()` can signal the running model/tool loop.

## Starting A Run

`HarnessStore.send()` starts a new run only when no run is active.

File:

- `packages/agent-harness/src/harness.ts`

After trimming input and ensuring a session, it creates ids:

```ts
const runId = `run_${randomUUID()}`;
const turnId = `turn_${randomUUID()}`;
const run = this.activeRun.begin({ runId, turnId, sessionId: session.id });
```

`begin()` creates the abort controller and resets steering:

```ts
begin(identity: ActiveRunIdentity): ActiveRunHandle {
  const abortController = new AbortController();
  const handle: InternalActiveRunHandle = {
    ...identity,
    abortController,
    signal: abortController.signal,
  };
  this.current = handle;
  this.steeringQueue = [];
  return handle;
}
```

The returned `run.signal` is passed into `buildRunAssembly()` and then into `RunController.run()`.

## Loading State

The harness snapshot uses `activeRun.isLoading()`:

```ts
this.snapshot = projectHarnessState({
  // ...
  isLoading: this.activeRun.isLoading(),
});
```

`isLoading()` is just `isActive()`:

```ts
isActive(): boolean {
  return this.current !== null;
}

isLoading(): boolean {
  return this.isActive();
}
```

So the UI's loading state is tied to whether the harness still has an active run handle, not to whether the model is currently streaming a token at that exact moment.

## Steering Messages

If `HarnessStore.send()` receives input while a run is active, it does not create a new run.

File:

- `packages/agent-harness/src/harness.ts`

```ts
if (this.activeRun.isActive()) {
  const steering = this.activeRun.acceptSteering({ content: input.content, sessionId: input.sessionId });
  if (!steering) return;
  this.eventBus.emitUserMessage({
    runId: steering.runId,
    turnId: steering.turnId,
    sessionId: steering.sessionId,
    content: steering.content,
    displayContent: input.displayContent ?? steering.content,
  });
  return;
}
```

`acceptSteering()` validates the input:

```ts
const content = input.content.trim();
if (!content) return null;
if (input.sessionId && input.sessionId !== this.current.sessionId) return null;
```

Then it queues the trimmed content:

```ts
this.steeringQueue.push(content);
```

The visible user message is emitted immediately into the current run and turn. This lets the transcript show the user's mid-run steering before the model has acted on it.

## Draining Steering

`RunController.run()` receives a callback:

```ts
getSteeringMessages: () => this.activeRun.drainSteeringMessages(),
```

File:

- `packages/agent-harness/src/harness.ts`

After each completed model step, `RunController` appends drained steering messages before deciding whether to continue:

```ts
activeMessages.push(...step.messages);

if (step.status !== "completed") {
  endedEarly = true;
  break;
}

activeMessages.push(...drainSteeringMessages(input.getSteeringMessages));

if (!step.hasToolCalls) {
  break;
}
```

File:

- `packages/agent-harness/src/run/RunController.ts`

`drainSteeringMessages()` converts queued strings into model-facing user messages:

```ts
function drainSteeringMessages(getSteeringMessages?: () => string[]): AgentMessage[] {
  if (!getSteeringMessages) return [];
  return getSteeringMessages().map((content) => ({
    role: "user",
    content,
  }));
}
```

This means steering is only injected between model steps. If the model is in the middle of a single long streaming step, steering waits until that step completes.

## Finishing A Run

`HarnessStore.send()` wraps `RunController.run()` in a `finally` block:

```ts
try {
  await this.runController.run({ ... });
} finally {
  this.activeRun.finish(run);
  this.sessionManager.refreshSessions();
  this.notify();
}
```

`finish()` clears the active handle only if the handle still matches the current run:

```ts
finish(handle: ActiveRunHandle): void {
  this.clear(handle);
  this.finalizedRunIds.delete(handle.runId);
}
```

The matching-handle check prevents a stale run handle from clearing a newer active run.

## TUI Double-Esc Cancel

The TUI does not cancel immediately on the first `Esc` during loading. It uses a double-Esc gesture.

The core helper lives in `packages/core/src/turnCancelGesture.ts`.

```ts
export const DOUBLE_ESCAPE_CANCEL_WINDOW_MS = 1500;
```

`handleDoubleEscapeCancel()` returns:

- `ignored`: not loading
- `armed`: first Esc during loading
- `cancelled`: second Esc within the window

```ts
if (firstEscapeAt !== null && input.now - firstEscapeAt <= windowMs) {
  resetDoubleEscapeCancel(input.state);
  input.cancel();
  return "cancelled";
}

input.state.firstEscapeAt = input.now;
return "armed";
```

The TUI wires this in `apps/tui/src/hooks/useChatRuntimeInteraction.ts`:

```ts
const requestTurnCancel = useCallback(() => {
  handleDoubleEscapeCancel({
    state: escapeCancelState.current,
    isLoading,
    now: Date.now(),
    cancel,
  });
}, [cancel, isLoading]);
```

When loading stops, it resets the gesture state:

```ts
useEffect(() => {
  if (!isLoading) resetDoubleEscapeCancel(escapeCancelState.current);
}, [isLoading]);
```

The footer hint comes from `apps/tui/src/chatModes/hints.ts`:

```ts
if (ctx.isLoading) {
  return "Esc twice cancel";
}
```

## Host Cancel Path

Both TUI and Desktop dispatch the same host intent:

```ts
| { type: "cancel" }
```

File:

- `packages/client/src/hostContract.ts`

The client wrapper sends:

```ts
async cancel(): Promise<void> {
  await this.host.dispatch({ type: "cancel" });
}
```

File:

- `packages/client/src/hostActions.ts`

`HarnessAgentHost` forwards it:

```ts
case "cancel":
  this.harness.cancel();
  return none();
```

File:

- `packages/agent-host/src/host/HarnessAgentHost.ts`

## Harness Cancel Path

The main cancellation implementation is `HarnessStore.cancel()`.

File:

- `packages/agent-harness/src/harness.ts`

```ts
cancel(): void {
  const run = this.activeRun.abort();
  if (!run) return;
  this.confirmRouter.cancelAll();
  this.activeRun.finalizeCancelled(
    run,
    this.eventStore.events,
    this.eventBus.createEmitter(run.runId, run.sessionId, run.turnId),
    "Cancelled by user.",
  );
  this.activeRun.clear(run);
  this.sessionManager.refreshSessions();
  this.notify();
}
```

This does five things:

1. Aborts the active run's `AbortSignal`.
2. Resolves pending confirmations as denied and pending questions as cancelled.
3. Emits finalization events for incomplete assistant/tool/turn state.
4. Clears the active run handle.
5. Refreshes sessions and notifies subscribers.

## Abort Signal Consumers

The active run signal is passed to:

- `runModelStep()` as `abortSignal`
- `streamText()` as `abortSignal`
- `ToolExecutionContext.abortSignal`

Files:

- `packages/agent-harness/src/run/runModelStep.ts`
- `packages/agent-harness/src/context/runAssembly.ts`

Tools can use the same signal. Current examples:

- `runProcess()` kills child commands on abort.
- `runSpawnedSubAgent()` kills the child subagent process on abort.

Files:

- `packages/agent-harness/src/tools/system.ts`
- `packages/agent-harness/src/subagentProcess.ts`

## Finalizing Incomplete Events

Cancellation can happen while assistant text or tool input is only partially streamed. The run finalizer closes those open structures so projection can settle into a coherent transcript.

Files:

- `packages/agent-harness/src/history/runFinalizer.ts`
- `packages/agent-harness/src/run/ActiveRunManager.ts`

`findIncompleteEvents()` scans events for the active run and turn:

- open assistant messages
- open tool executions
- whether the turn is still open

For open assistant messages, `emitRunFinalization()` emits `MESSAGE_END` with `isError: true`:

```ts
emit(MESSAGE_END, {
  message: { id: message.id, role: "assistant", content: message.content, isError: true },
});
```

For open tools, it emits `TOOL_EXECUTION_END`:

```ts
emit(TOOL_EXECUTION_END, {
  toolCallId: tool.toolCallId,
  toolName: tool.toolName,
  toolArgs: tool.toolArgs,
  result: `${reason} Tool input did not complete.`,
  isError: true,
}, { relatedToolCallId: tool.toolCallId });
```

If the turn is open, it emits:

```ts
emit(TURN_END, { cancelled: true });
emit(AGENT_END, { cancelled: true });
```

`ActiveRunManager.finalizeCancelled()` also records the run id in `finalizedRunIds`.

## Why finalizedRunIds Exists

`EventBus` receives a callback:

```ts
(runId) => this.activeRun.isRunFinalized(runId)
```

File:

- `packages/agent-harness/src/harness.ts`

When a run has been finalized, `EventBus.emit()` returns a constructed event without storing it:

```ts
if (this.isRunFinalized(runId)) {
  return makeHarnessEvent({ ... });
}
```

File:

- `packages/agent-harness/src/EventBus.ts`

This prevents late events from an already-cancelled run from mutating the canonical event store after finalization.

When a normal run finishes, `activeRun.finish(handle)` removes that run id from `finalizedRunIds`.

## Session Operations Cancel First

Several session operations call `this.cancel()` before changing session state:

- `createSession`
- `switchSession`
- `deleteSession`
- `deleteAllSessions`
- `compactCurrentSession`

File:

- `packages/agent-harness/src/harness.ts`

This prevents a running turn from continuing to write events into a session that the user is leaving, deleting, or compacting.

## Testing Coverage

Current targeted coverage includes:

- `packages/agent-harness/__tests__/activeRun.test.ts`
  - begin/loading/current identity
  - stale handle protection
  - steering validation and drain-once behavior
  - abort and clear behavior
  - cancellation finalizes open messages, tools, turns, and agent lifecycle
- `packages/agent-harness/__tests__/runController.test.ts`
  - steering messages are injected mid-run between tool-loop steps
  - partial tool input is finalized when model streaming fails before execution
  - tool input updates are coalesced
- `apps/tui/__tests__/modeHints.test.ts`
  - loading hint shows `Esc twice cancel`

## Files To Read

Start with active run state:

- `packages/agent-harness/src/run/ActiveRunManager.ts`
- `packages/agent-harness/src/harness.ts`
- `packages/agent-harness/src/history/runFinalizer.ts`

Then read run execution:

- `packages/agent-harness/src/run/RunController.ts`
- `packages/agent-harness/src/run/runModelStep.ts`
- `packages/agent-harness/src/run/RunStepRecorder.ts`
- `packages/agent-harness/src/context/RunEventWriter.ts`

Then read cancel and UI wiring:

- `packages/core/src/turnCancelGesture.ts`
- `packages/client/src/hostContract.ts`
- `packages/client/src/hostActions.ts`
- `packages/agent-host/src/host/HarnessAgentHost.ts`
- `apps/tui/src/hooks/useChatRuntimeInteraction.ts`
- `apps/tui/src/chatModes/inputMode.ts`
- `apps/tui/src/chatModes/hints.ts`
- `apps/desktop/src/renderer/hooks/useAgentHost.ts`

## Mental Model

When debugging active-run behavior, follow the run identity.

1. `send()` creates `{ runId, turnId, sessionId }`.
2. `ActiveRunManager.begin()` stores that identity and creates the abort signal.
3. A second send with the same session becomes steering for that identity.
4. `RunController` drains steering between completed model steps.
5. Cancellation aborts the signal and finalizes incomplete events for that identity.
6. Late events for finalized runs are ignored by `EventBus`.
7. `finish()` or `clear()` removes the active handle so `isLoading` becomes false.

If the UI stays loading, inspect `activeRun.currentIdentity()`. If steering is ignored, check whether the input is blank or targets a different session. If cancelled turns leave dangling tool rows, inspect `findIncompleteEvents()` and the emitted `TOOL_EXECUTION_END` / `TURN_END` events.
