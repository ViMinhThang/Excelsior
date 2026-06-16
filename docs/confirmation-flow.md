# Confirmation Flow

This document walks through how tool confirmations work end to end: which tools request approval, how the harness blocks while waiting for the user, how TUI/Desktop respond, and how approval or denial resumes the tool execution.

## Big Picture

Confirmation is the safety gate for write-like actions.

Read-only tools execute directly. Write-like tools either stop immediately in Plan mode or request user approval in Act mode. While a tool is waiting for approval, the harness exposes `pendingConfirmation` in the client snapshot. The UI renders an approval prompt and dispatches the user's decision back to the host.

The high-level path is:

```text
Tool decides approval is needed
  -> tool calls ctx.confirm(...)
  -> harness creates callId and stores resolver
  -> harness emits confirmation_requested
  -> harness snapshot exposes pendingConfirmation
  -> TUI/Desktop renders approval prompt
  -> user approves or denies
  -> UI dispatches respond-to-confirmation
  -> harness resolves matching callId
  -> harness emits confirmation_answered
  -> blocked tool resumes
  -> tool either performs action or returns Denied by user.
```

## Shared Data Contract

The shared types live in `packages/core/src/confirmation.ts`.

```ts
export type DiffAction = "create" | "overwrite" | "edit" | "warning";

export type ConfirmRequest = {
  callId: string;
  toolName: string;
  args: string;
  diff?: string;
  filePath?: string;
  action?: DiffAction;
  warning?: string;
};

export type ConfirmResponse = {
  callId: string;
  approved: boolean;
};
```

Important fields:

- `callId` correlates the visible prompt with the suspended resolver in the harness.
- `toolName` and `args` describe the pending tool action.
- `filePath`, `diff`, and `action` let the UI build file-change previews.
- `warning` carries extra caution text, especially for paths outside the workspace.
- `approved` is the only decision the tool receives.

## Which Tools Ask For Confirmation

The main confirmation callers are the write-like file tools and write-like shell commands.

Files:

- `packages/agent-harness/src/tools/fs.ts`
- `packages/agent-harness/src/tools/system.ts`

### File Writes

`writeFile` / `write` and `editFile` / `edit` block in Plan mode:

```ts
if (ctx.mode === "plan") return text(PLAN_MODE_BLOCKED_MESSAGE, true);
```

In Act mode, they call `authorizeWrite()` before touching the filesystem:

```ts
const authorization = await authorizeWrite(ctx, name, filePath);
if (!authorization.approved) return text("Denied by user.");
```

`authorizeWrite()` resolves the target path, detects whether it is outside the workspace, and asks for confirmation:

```ts
const response = await ctx.confirm({
  toolName,
  args: JSON.stringify({
    filePath,
    ...(outsideWorkspace ? {
      resolvedPath: fullPath,
      outsideWorkspace: true,
      workspaceRoot: ctx.workspaceRoot,
    } : {}),
  }),
  filePath: displayPath,
  action: outsideWorkspace
    ? "warning"
    : existsSync(fullPath) ? "overwrite" : "create",
  warning: outsideWorkspace
    ? `Target is outside the workspace. Review carefully before approving.\nTarget: ${fullPath}\nWorkspace: ${ctx.workspaceRoot}`
    : undefined,
});
```

If approved, file tools create a backup entry before writing. That backup is what `/revert` later uses to restore changed files.

### Shell Commands

`runCommand` classifies command risk before execution.

Dangerous commands are blocked outright:

```ts
if (risk.blocked) return text(risk.message, true);
```

Write-like commands in Plan mode are blocked:

```ts
if (ctx.mode === "plan" && risk.writeLike) return text(PLAN_MODE_BLOCKED_MESSAGE, true);
```

Write-like commands in Act mode ask for approval:

```ts
if (risk.writeLike) {
  const response = await ctx.confirm({
    toolName: "runCommand",
    args: JSON.stringify({ command, args: normalizedArgs }),
    action: "warning",
  });
  if (!response.approved) return text("Denied by user.");
}
```

Non-write-like commands execute without confirmation.

## Harness Entry Point

The confirmation callback is assembled in `HarnessStore.send()`.

File:

- `packages/agent-harness/src/harness.ts`

```ts
const assembly = buildRunAssembly({
  // ...
  confirm: (request) => this.requestConfirmation(request),
  askQuestion: (request) => this.requestQuestion(request),
  // ...
});
```

`buildRunAssembly()` puts that callback into the tool context:

```ts
toolContext: {
  // ...
  confirm: input.confirm,
}
```

File:

- `packages/agent-harness/src/context/runAssembly.ts`

So tools only know about `ctx.confirm(...)`; they do not know how the UI, host contract, or event store work.

## Creating A Pending Confirmation

The harness creates pending confirmations in `requestConfirmation()`.

File:

- `packages/agent-harness/src/harness.ts`

```ts
private requestConfirmation(request: Omit<ConfirmRequest, "callId">): Promise<ConfirmResponse> {
  return new Promise((resolveResponse) => {
    const callId = randomUUID();
    const active = this.activeRun.currentIdentity();
    const runId = active?.runId ?? `run_${randomUUID()}`;
    const turnId = active?.turnId;
    const sessionId = active?.sessionId ?? this.sessionManager.currentSession()?.id;
    const confirmRequest = { callId, ...request };

    this.confirmRouter.addConfirmation(confirmRequest, (response) => {
      if (sessionId) {
        this.eventBus.emit(runId, CONFIRMATION_ANSWERED, { response }, { sessionId, turnId });
      }
      resolveResponse(response);
      this.notify();
    });

    if (sessionId) {
      this.eventBus.emit(runId, CONFIRMATION_REQUESTED, { request: confirmRequest }, { sessionId, turnId });
    }
    this.notify();
  });
}
```

This method:

1. Generates a `callId`.
2. Captures the active run, turn, and session.
3. Stores the pending request and resolver in `ConfirmationRouter`.
4. Emits `confirmation_requested`.
5. Schedules a snapshot update.

The returned promise is what blocks the tool until the user responds.

## Confirmation Router

`ConfirmationRouter` handles both confirmations and questions.

File:

- `packages/agent-harness/src/ConfirmationRouter.ts`

For confirmations, cancellation defaults to denial:

```ts
private readonly confirmations = new PendingRequestRoute<ConfirmRequest, ConfirmResponse>(
  (callId) => ({ callId, approved: false }),
);
```

The generic route stores:

- `pending`: the currently visible request.
- `resolvers`: a map from `callId` to the promise resolver.

Resolving a confirmation clears the visible prompt and resumes the blocked tool:

```ts
resolve(callId: string, response: TResponse): void {
  const resolver = this.resolvers.get(callId);
  if (!resolver) return;
  this.resolvers.delete(callId);
  this.pending = null;
  resolver(response);
}
```

Current design note: multiple resolvers can exist, but only one confirmation is exposed as `pendingConfirmation` at a time.

## Events And Snapshot State

Confirmation events are defined in `packages/agent-harness/src/events.ts`:

```ts
export const CONFIRMATION_REQUESTED = "confirmation_requested";
export const CONFIRMATION_ANSWERED = "confirmation_answered";
```

Their payloads are:

```ts
[CONFIRMATION_REQUESTED]: { request: ConfirmRequest };
[CONFIRMATION_ANSWERED]: { response: ConfirmResponse };
```

Like question events, confirmation events are stored for traceability but not projected as normal transcript blocks. The live UI prompt comes from the snapshot:

```ts
this.snapshot = projectHarnessState({
  // ...
  pendingConfirmation: this.confirmRouter.pendingConfirmation,
  pendingQuestion: this.confirmRouter.pendingQuestion,
});
```

File:

- `packages/agent-harness/src/harness.ts`

The shared snapshot type includes:

```ts
pendingConfirmation: ConfirmRequest | null;
```

File:

- `packages/core/src/clientState.ts`

## Host Contract

The client-host contract exposes two confirmation intents.

File:

- `packages/client/src/hostContract.ts`

```ts
| { type: "respond-to-confirmation"; callId: string; approved: boolean }
| { type: "approve-all-confirmations" }
```

The client wrapper sends those intents:

```ts
async respondToConfirmation(callId: string, approved: boolean): Promise<void> {
  await this.host.dispatch({ type: "respond-to-confirmation", callId, approved });
}

async approveAllConfirmations(): Promise<void> {
  await this.host.dispatch({ type: "approve-all-confirmations" });
}
```

File:

- `packages/client/src/hostActions.ts`

`HarnessAgentHost` forwards the response to the harness:

```ts
case "respond-to-confirmation":
  this.harness.respondToConfirmation(intent.callId, intent.approved);
  return none();
```

The current `approve-all-confirmations` implementation approves only the currently pending confirmation:

```ts
case "approve-all-confirmations": {
  const pending = this.harness.getSnapshot().pendingConfirmation;
  if (pending) this.harness.respondToConfirmation(pending.callId, true);
  return none();
}
```

File:

- `packages/agent-host/src/host/HarnessAgentHost.ts`

That means `approve all` is not a persistent auto-approve mode. It is a convenience action for the currently exposed prompt.

## TUI Flow

The TUI reads `pendingConfirmation` through `useAgentHostClient()` and wires it in `useChatInteractionController()`.

Files:

- `apps/tui/src/hooks/useAgentHostClient.ts`
- `apps/tui/src/hooks/useChatInteractionController.ts`
- `apps/tui/src/hooks/useToolConfirmation.ts`
- `apps/tui/src/hooks/chatScreenViewModel.ts`
- `apps/tui/src/components/chat/PendingActionPanel.tsx`

`useToolConfirmation()` owns the local UI state for diff preview navigation:

- scroll offset
- active hunk index
- hunk count

It exposes:

- `approve()`
- `approveAll()`
- `deny()`
- `scrollUp()`
- `scrollDown()`
- `nextHunk()`
- `prevHunk()`

The view model converts the pending confirmation into `PendingActionPanelProps`:

```ts
return {
  display: createToolDisplay({
    toolName: pending.toolName,
    toolArgs: pending.args,
    status: "pending",
    filePath: pending.filePath,
    diff: pending.diff,
  }),
  scrollOffset,
  activeHunkIndex,
  hunkCount,
  helpText: pending.warning,
};
```

`PendingActionPanel` renders:

- tool label and summary
- detail or waiting text
- warning/help text
- `y accept`, `a accept all`, `n deny`
- optional file-change preview

TUI keybindings for confirmations live in `apps/tui/src/hooks/useChatKeymaps.ts`:

- `y`: approve current prompt
- `a`: approve current prompt through `approveAllConfirmations`
- `n`: deny
- `Esc`: deny and cancel
- `Up` / `Down`: scroll diff
- `Tab` / `Shift+Tab`: move between hunks

## Desktop Flow

Desktop uses the same host contract over Electron IPC.

Renderer files:

- `apps/desktop/src/renderer/hooks/useAgentHost.ts`
- `apps/desktop/src/renderer/components/ChatPanel.tsx`
- `apps/desktop/src/renderer/components/chatPanel/PendingPrompts.tsx`

Main process files:

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/preload.ts`
- `apps/desktop/src/main/workspaceHost.ts`

`ChatPanel` renders a `PendingConfirmation` whenever `state.pendingConfirmation` exists:

```tsx
{state?.pendingConfirmation && (
  <PendingConfirmation
    confirmation={state.pendingConfirmation}
    onRespond={onRespondToConfirmation}
  />
)}
```

Desktop shows:

- a warning icon
- display label
- formatted command
- file-change summary when available
- Approve and Deny buttons

It does not expose the same hunk navigation controls as the TUI.

## Returning To The Tool

When the user responds:

1. UI dispatches `respond-to-confirmation`.
2. `HarnessAgentHost` calls `harness.respondToConfirmation(...)`.
3. The harness calls `confirmRouter.resolveConfirmation(...)`.
4. The stored resolver emits `confirmation_answered`.
5. The promise returned by `ctx.confirm()` resolves.
6. The tool checks `response.approved`.

For denied file writes and write-like commands, the tool returns:

```ts
Denied by user.
```

For approved writes, the file tool backs up the previous state, applies the write/edit, builds a unified diff, and returns a success message plus diff.

For approved write-like commands, `runCommand` executes the process and returns stdout/stderr/timeout output.

## Cancellation

Run-level cancellation calls `confirmRouter.cancelAll()`.

File:

- `packages/agent-harness/src/harness.ts`

```ts
cancel(): void {
  const run = this.activeRun.abort();
  if (!run) return;
  this.confirmRouter.cancelAll();
  this.activeRun.finalizeCancelled(...);
  this.activeRun.clear(run);
  this.sessionManager.refreshSessions();
  this.notify();
}
```

For confirmations, router cancellation resolves every pending confirmation with:

```ts
{ callId, approved: false }
```

So cancellation is treated as denial from the tool's point of view.

## Safety Notes

The confirmation flow is not the only safety layer.

- Plan mode blocks write-like file and command tools before confirmation.
- Read tools reject paths outside the workspace.
- File write/edit tools warn for paths outside the workspace and require approval.
- `runCommand` blocks a small set of dangerous commands before confirmation.
- Backups are created before approved file writes/edits when `backupDir` is available.

Confirmations are therefore the final user approval point for allowed risky actions, not the whole policy.

## Testing Coverage

Current targeted coverage includes:

- `packages/agent-harness/__tests__/tools.test.ts`
  - write-like tools block in Plan mode
  - outside-workspace writes request warning confirmation
  - approved writes and edits return diffs
  - denied writes return `Denied by user.`
- `packages/agent-harness/__tests__/harness.test.ts`
  - Plan mode write blocking
  - backup restore behavior used by revert
- `apps/tui/__tests__/chatScreenViewModel.test.ts`
  - pending confirmation view-model behavior

## Files To Read

Start with the contract and router:

- `packages/core/src/confirmation.ts`
- `packages/core/src/clientState.ts`
- `packages/agent-harness/src/ConfirmationRouter.ts`
- `packages/agent-harness/src/harness.ts`
- `packages/agent-harness/src/events.ts`

Then read the tools:

- `packages/agent-harness/src/tools/fs.ts`
- `packages/agent-harness/src/tools/system.ts`

Then read host and UI:

- `packages/client/src/hostContract.ts`
- `packages/client/src/hostActions.ts`
- `packages/agent-host/src/host/HarnessAgentHost.ts`
- `apps/tui/src/hooks/useToolConfirmation.ts`
- `apps/tui/src/components/chat/PendingActionPanel.tsx`
- `apps/tui/src/hooks/useChatKeymaps.ts`
- `apps/desktop/src/renderer/components/chatPanel/PendingPrompts.tsx`

## Mental Model

When debugging confirmations, follow the `callId`.

1. A tool calls `ctx.confirm(...)`.
2. `requestConfirmation()` adds a resolver under a generated `callId`.
3. The snapshot exposes the same `callId` in `pendingConfirmation`.
4. The UI sends `respond-to-confirmation` with that `callId`.
5. `ConfirmationRouter.resolveConfirmation()` resumes the exact resolver.
6. The tool continues with `approved: true` or `approved: false`.

If the prompt does not appear, inspect `snapshot.pendingConfirmation`. If the prompt appears but responding does nothing, inspect the response `callId`. If the tool does not continue, inspect whether the resolver was cleared and whether `confirmation_answered` was emitted.
