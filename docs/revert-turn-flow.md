# Revert Turn Flow

This document walks through how `/revert` works, from the TUI command input to the harness removing the latest completed turn and restoring file backups.

## What Revert Means

Revert is a harness-level operation that targets the latest completed, non-cancelled turn.

It does two things:

- removes that turn and everything after it from the session event history
- restores filesystem changes that were backed up for that turn

The important files are:

- `packages/agent-harness/src/commands.ts`
- `packages/agent-harness/src/harness.ts`
- `packages/agent-harness/src/history/revert.ts`
- `packages/agent-harness/src/tools/fs.ts`
- `packages/agent-harness/src/context/runAssembly.ts`

## User Entry Point

The user types:

```txt
/revert
```

The TUI submit path is in `apps/tui/src/hooks/useChatSubmission.ts`.

It trims the input and checks whether it is a command:

```ts
const command = getSubmittedCommand(trimmed);
if (command) {
  resetInput();
  executeCommand(command).then((result) => {
    if (!result.handled) return;
    if (result.message) setCommandResult(result.message);
    if (result.openPanelId) openPanel(result.openPanelId);
    if (result.navigate) navigate(result.navigate);
  });
  return;
}
```

`getSubmittedCommand(...)` lives in `apps/tui/src/lib/commandSubmission.ts`.

It treats any non-empty input starting with `/` as a command:

```ts
export function getSubmittedCommand(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed === "/") return null;
  return trimmed;
}
```

So `/revert` is not sent to the agent as a chat message. It is routed as a command.

## Client Dispatch

The TUI calls `executeCommand(command)` through `useAgentHostClient()`.

That hook wraps `AgentHostClient` from `packages/client/src/hostActions.ts`.

The generic command path is:

```ts
async executeCommand(input: string): Promise<CommandResult> {
  return commandResultOrDefault(
    await this.host.dispatch({ type: "execute-command", input }),
  );
}
```

There is also a direct client method for revert:

```ts
async revertLastTurn(): Promise<CommandResult> {
  return commandResultOrDefault(
    await this.host.dispatch({ type: "revert-last-turn" }),
  );
}
```

The TUI command path currently uses `execute-command`, while other clients can call `revertLastTurn()` directly.

## Host Dispatch

The default host implementation is `packages/agent-host/src/host/HarnessAgentHost.ts`.

For `/revert`, the command path goes through:

```ts
case "execute-command":
  return {
    type: "command-result",
    result: await this.harness.executeCommand(intent.input),
  };
```

If a client dispatches the direct intent, it goes through:

```ts
case "revert-last-turn":
  return {
    type: "command-result",
    result: await this.harness.revertLastTurn(),
  };
```

Both paths end at the harness.

## Built-In Command Registration

`/revert` is registered in `packages/agent-harness/src/commands.ts`.

The command definition is:

```ts
command(
  "revert",
  "runtime",
  "Revert the last completed turn",
  "/revert",
  async (_args, harness) => harness.revertLastTurn(),
)
```

So once the harness parses `/revert`, it simply calls `harness.revertLastTurn()`.

## Harness Command Parsing

The harness command execution path is in `packages/agent-harness/src/harness.ts`.

`executeCommand(input)` parses the slash command, finds the registered command, and executes it:

```ts
const command = this.commands.get(parsed.name);
if (!command) {
  return {
    handled: true,
    message: `Unknown command: /${parsed.name}. Type /help for a list of commands.`,
    clearInput: true,
  };
}
return command.execute(parsed.args, this);
```

For `/revert`, this invokes `revertLastTurn()`.

## Harness Revert Method

`revertLastTurn()` lives in `packages/agent-harness/src/harness.ts`.

The method is:

```ts
async revertLastTurn(): Promise<CommandResult> {
  const session = this.sessionManager.currentSession();
  if (!session) return { handled: true, message: "No active session.", clearInput: true };

  const result = revertLastCompletedTurn(this.eventStore.events);
  if (!result) {
    return { handled: true, message: "No completed turn to revert.", clearInput: true };
  }

  await this.restoreBackups(session.id, result.revertedTurnId);

  this.eventStore.replaceEvents(session, result.events);
  this.sessionManager.refreshSessions();
  this.notify();
  return { handled: true, message: "Reverted last turn.", clearInput: true };
}
```

The method does the work in this order:

1. Get the current session.
2. Compute the reverted event list.
3. Restore file backups for the reverted turn.
4. Replace the session events.
5. Refresh sessions.
6. Notify subscribers so the UI rerenders.
7. Return a command result message.

## Finding The Turn To Revert

The event-history logic is in `packages/agent-harness/src/history/revert.ts`.

The public helper is:

```ts
export function revertLastCompletedTurn(events: readonly AnyHarnessEvent[]): RevertLastTurnResult | null {
  const lastTurnEnd = findLastCompletedTurnEnd(events);
  if (!lastTurnEnd?.turnId) return null;

  const turnStartIndex = events.findIndex((event) => event.turnId === lastTurnEnd.turnId);
  if (turnStartIndex === -1) return null;

  return {
    events: events.slice(0, turnStartIndex),
    revertedTurnId: lastTurnEnd.turnId,
  };
}
```

It works by:

1. scanning backward for the latest `TURN_END`
2. ignoring cancelled turns
3. taking that event's `turnId`
4. finding the first event with that same `turnId`
5. returning all events before that first event

The scan function is:

```ts
function findLastCompletedTurnEnd(events: readonly AnyHarnessEvent[]): AnyHarnessEvent | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type === TURN_END && !event.data.cancelled) return event;
  }
  return null;
}
```

So a cancelled/interrupted turn is not considered the target of revert.

## Why It Removes Events After The Turn Too

The returned event list is:

```ts
events.slice(0, turnStartIndex)
```

That means the reverted turn and every event after it are removed.

This matters if the event log somehow has later events after the latest completed turn target. Revert restores the session to the exact state before that turn began, rather than trying to surgically remove only matching turn ids.

## Replacing Events

After computing the new event list, the harness calls:

```ts
this.eventStore.replaceEvents(session, result.events);
```

`EventStore.replaceEvents(...)` lives in `packages/agent-harness/src/EventStore.ts`.

It updates in-memory state:

```ts
this.events = events;
this.sequence = events.at(-1)?.sequence ?? 0;
this.lastEventId = events.at(-1)?.id;
```

Then it persists the replacement:

```ts
if (session) {
  this.storage.replaceEvents(this.workspaceId, session, events);
}
```

After that, the next projection pass sees the shorter event list. `ProjectionCache`/`Projector` detects that the event list no longer extends the previous list, resets, and replays from the beginning.

## Filesystem Backup Setup

Revert can restore file changes because each run gets a turn-specific backup directory.

That path is added to the tool context in `packages/agent-harness/src/context/runAssembly.ts`:

```ts
backupDir: resolve(
  input.storageRoot,
  "backups",
  input.workspaceId,
  input.sessionId,
  input.turnId,
),
```

So backups are grouped by:

```txt
<storageRoot>/backups/<workspaceId>/<sessionId>/<turnId>/
```

Only tools that use this `backupDir` can participate in filesystem restore.

## Writing Backups

The backup writer is `backupFile(...)` in `packages/agent-harness/src/tools/fs.ts`.

It is called before write tools mutate the workspace:

```ts
await backupFile(ctx, filePath, fullPath);
```

The current write tools that call it are:

- `writeFile`
- `editFile`

The backup manifest is:

```ts
Array<{ path: string; action: "modify" | "create" }>
```

If the target file already exists:

1. read its original content
2. write that content under the backup directory using the same relative path
3. add `{ path, action: "modify" }` to `manifest.json`

If the target file does not exist:

1. do not write a backup file
2. add `{ path, action: "create" }` to `manifest.json`

The function skips duplicate entries for the same path:

```ts
if (manifest.some((entry) => entry.path === relativePath)) {
  return;
}
```

That means the backup preserves the state from before the first mutation of that file in the turn.

## Restoring Backups

The restore logic is `restoreBackups(...)` in `packages/agent-harness/src/harness.ts`.

It computes:

```ts
const backupDir = resolve(
  this.storage.rootDir,
  "backups",
  this.workspace.id,
  sessionId,
  turnId,
);
const manifestPath = resolve(backupDir, "manifest.json");
```

If there is no manifest, it returns without doing anything.

For each manifest entry:

```ts
const workspacePath = resolve(this.workspace.rootPath, entry.path);
```

Then:

- `modify`: read the backup file and write it back to the workspace path
- `create`: delete the workspace file if it exists

So:

- files modified by the turn are restored to their original content
- files created by the turn are removed

If restore fails, the harness logs:

```ts
console.error("Failed to restore backups:", err);
```

It does not currently return a failed command result for backup restore errors.

## UI Refresh After Revert

After restoring backups and replacing events, the harness calls:

```ts
this.sessionManager.refreshSessions();
this.notify();
```

The notify path updates the harness snapshot and notifies subscribers.

The TUI receives updated state through:

```txt
harness.notify()
  -> AgentHost.subscribe listener
  -> useSyncExternalStore
  -> useAgentHostClient()
  -> useChatInteractionController()
  -> ChatScreen rerender
```

Because the event log was shortened, projection produces fewer turns/blocks, and the reverted turn disappears from the transcript.

The command result message `Reverted last turn.` is shown through the TUI command result path in `useChatSubmission.ts`.

## End-To-End Flow

The full `/revert` path is:

```txt
User submits /revert
  -> useChatSubmission
  -> getSubmittedCommand
  -> agent.executeCommand("/revert")
  -> AgentHostClient.dispatch({ type: "execute-command" })
  -> HarnessAgentHost.dispatch(...)
  -> harness.executeCommand("/revert")
  -> built-in command "revert"
  -> harness.revertLastTurn()
  -> revertLastCompletedTurn(eventStore.events)
  -> restoreBackups(session.id, revertedTurnId)
  -> eventStore.replaceEvents(session, result.events)
  -> sessionManager.refreshSessions()
  -> harness.notify()
  -> TUI rerenders projected turns
```

The direct client API path is shorter:

```txt
client.revertLastTurn()
  -> dispatch({ type: "revert-last-turn" })
  -> HarnessAgentHost
  -> harness.revertLastTurn()
```

## What Revert Does Not Do

Current revert behavior does not:

- ask for confirmation before reverting
- delete backup files after restoring
- revert cancelled turns
- revert arbitrary older turns
- restore changes from tools that did not call `backupFile(...)`
- report backup-restore failures as command failures

It is a "restore to before the latest completed turn" operation, not a general undo stack.

## Tests To Check

Useful tests:

- `packages/agent-harness/__tests__/context.test.ts`
- `packages/agent-harness/__tests__/harness.test.ts`

The harness test includes coverage for reverting file modifications and creations.

## Where To Start Reading

Read these files in order:

1. `apps/tui/src/hooks/useChatSubmission.ts`
2. `apps/tui/src/lib/commandSubmission.ts`
3. `packages/client/src/hostActions.ts`
4. `packages/agent-host/src/host/HarnessAgentHost.ts`
5. `packages/agent-harness/src/commands.ts`
6. `packages/agent-harness/src/harness.ts`
7. `packages/agent-harness/src/history/revert.ts`
8. `packages/agent-harness/src/EventStore.ts`
9. `packages/agent-harness/src/context/runAssembly.ts`
10. `packages/agent-harness/src/tools/fs.ts`
