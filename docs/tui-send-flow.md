# TUI Send Flow

This document walks through what happens when a user submits a normal chat message in the TUI, from the input handler to the agent harness run loop.

## 1. App Wires A Host

The TUI app installs an `AgentHostProvider` around the router:

- `apps/tui/src/app.tsx`
- `apps/tui/src/context/AgentHostContext.tsx`

`AgentHostProvider` resolves the host with `getDefaultAgentHost()` from `@excelsior/agent-host`. That default host is a singleton `HarnessAgentHost`:

- `packages/agent-host/src/host/defaultHost.ts`
- `packages/agent-host/src/host/HarnessAgentHost.ts`

So the TUI talks to the client-facing `AgentHost` interface, while the concrete backend is the agent harness.

## 2. Chat Screen Builds Runtime Interaction

The chat screen uses:

- `apps/tui/src/screens/ChatScreen.tsx`
- `apps/tui/src/hooks/useChatInteractionController.ts`
- `apps/tui/src/hooks/useChatRuntimeInteraction.ts`

`useChatInteractionController` gathers host state and feature hooks, then `useChatRuntimeInteraction` owns the submit path.

Inside `useChatRuntimeInteraction`, the important submit setup is:

```ts
const handleSubmit = useChatSubmission({
  isLoading,
  inputRef: inputHistory.inputRef,
  executeCommand,
  send: sendWithOptimisticMessage,
  resetInput: inputHistory.resetInput,
  setCommandResult: command.setCommandResult,
  openPanel: panel.openPanel,
  navigate,
  getSubmittedInput: () => getCommandInputWithSelection(
    interactionState.inputModeKeymap,
    inputHistory.input,
  ),
});
```

File:

- `apps/tui/src/hooks/useChatRuntimeInteraction.ts`

`sendWithOptimisticMessage` sets an optimistic user message before delegating to the real host send function.

## 3. Submit Separates Commands From Chat Messages

The actual submission decision lives in:

- `apps/tui/src/hooks/useChatSubmission.ts`

`useChatSubmission` does three things:

1. Ignore submit while loading.
2. If the input is a known slash command, call `executeCommand`.
3. If it is normal text, reset the input and call `send(trimmed)`.

The normal chat path is:

```ts
resetInput();
send(trimmed);
```

Unknown slash-prefixed input is ignored:

```ts
if (trimmed.startsWith("/")) return;
```

## 4. TUI Calls The Client Wrapper

The TUI does not call the harness directly. It uses:

- `apps/tui/src/hooks/useAgentHostClient.ts`
- `packages/client/src/hostActions.ts`
- `packages/client/src/hostContract.ts`

`useAgentHostClient` creates an `AgentHostClient` from the current `AgentHost`.

The send wrapper is:

```ts
send: useCallback(
  (content: string, options?: SendOptions) => {
    void client.send(content, options);
  },
  [client],
),
```

Then `AgentHostClient.send` turns it into a host intent:

```ts
await this.host.dispatch({ type: "send", content, options });
```

File:

- `packages/client/src/hostActions.ts`

The interface for that intent is:

```ts
| { type: "send"; content: string; options?: SendOptions }
```

File:

- `packages/client/src/hostContract.ts`

## 5. HarnessAgentHost Dispatches To The Harness

The concrete host adapter is:

- `packages/agent-host/src/host/HarnessAgentHost.ts`

For a send intent, it calls the harness:

```ts
case "send":
  await this.harness.send({
    content: intent.content,
    mode: this.harness.getSnapshot().mode,
    ...intent.options,
  });
  return none();
```

This is the handoff from the app/client layer into `@excelsior/agent-harness`.

## 6. Harness Handles Active-Run Steering Or Starts A New Run

The harness send entry point is:

- `packages/agent-harness/src/harness.ts`

Method:

```ts
async send(input: {
  content: string;
  mode: AgentMode;
  sessionId?: string;
  displayContent?: string;
  silent?: boolean;
}): Promise<void>
```

First, it checks whether a run is already active:

```ts
if (this.activeRun.isActive()) {
  const steering = this.activeRun.acceptSteering({ content: input.content, sessionId: input.sessionId });
  if (!steering) return;
  this.eventBus.emitUserMessage(...);
  return;
}
```

That means a message sent during an active run becomes a steering message for the current run, not a brand-new run.

If no run is active, the harness:

1. Trims the input.
2. Switches session if requested.
3. Ensures a session exists.
4. Creates `runId` and `turnId`.
5. Starts an active run through `ActiveRunManager`.

Relevant files:

- `packages/agent-harness/src/harness.ts`
- `packages/agent-harness/src/run/ActiveRunManager.ts`

## 7. Harness Builds Run Assembly

Still in `harness.send`, the harness builds the execution context:

```ts
const assembly = buildRunAssembly({
  workspaceRoot: this.workspace.rootPath,
  storageRoot: this.storage.rootDir,
  workspaceId: this.workspace.id,
  sessionId: session.id,
  runId,
  turnId,
  events: this.eventStore.events,
  userContent: content,
  mode: runMode,
  abortSignal: run.signal,
  settings: this.settingsStore.settings,
  providers: this.providers,
  tools: this.tools,
  skillsList: this.skillsList,
  confirm: (request) => this.requestConfirmation(request),
  askQuestion: (request) => this.requestQuestion(request),
  createEmitter: (activeRunId, activeSessionId, activeTurnId) =>
    this.eventBus.createEmitter(activeRunId, activeSessionId, activeTurnId),
});
```

File:

- `packages/agent-harness/src/context/runAssembly.ts`

`buildRunAssembly` creates:

- `runContext`: model messages and system prompt
- `toolContext`: workspace, mode, confirmation/question callbacks, providers, tools, backup path
- `emit`: run-scoped event emitter

## 8. User Message Is Emitted

Unless the send is marked `silent`, the harness emits the submitted user message:

```ts
this.eventBus.emitUserMessage({
  runId,
  turnId,
  sessionId: session.id,
  content,
  displayContent: input.displayContent ?? content,
});
```

The event bus persists the event and updates projected client state through the harness snapshot flow.

Relevant files:

- `packages/agent-harness/src/EventBus.ts`
- `packages/agent-harness/src/EventStore.ts`
- `packages/agent-harness/src/projection.ts`
- `packages/agent-harness/src/projector/`

## 9. RunController Executes The Agent Loop

After assembly, the harness starts the run controller:

```ts
await this.runController.run({
  messages: assembly.runContext.messages,
  systemPrompt: assembly.runContext.systemPrompt,
  settings: this.settingsStore.settings,
  providers: this.providers,
  tools: this.tools,
  toolContext: assembly.toolContext,
  signal: run.signal,
  emit: assembly.emit,
  getSteeringMessages: () => this.activeRun.drainSteeringMessages(),
});
```

File:

- `packages/agent-harness/src/run/RunController.ts`

`RunController` is responsible for:

- emitting `AGENT_START` and `TURN_START`
- running one model step at a time
- appending assistant/tool results to active model messages
- draining steering messages between tool-loop steps
- enforcing the configured tool-loop limit
- emitting `TURN_END` and `AGENT_END`

## 10. One Model Step Streams Through runModelStep

Each model step is handled by:

- `packages/agent-harness/src/run/runModelStep.ts`
- `packages/agent-harness/src/run/RunStepRecorder.ts`
- `packages/agent-harness/src/context/RunEventWriter.ts`

`runModelStep` creates the model and calls `streamText`:

```ts
const result = streamText({
  model,
  system: input.systemPrompt,
  messages: toModelMessages(input.messages),
  tools: input.tools.toToolSet(input.toolContext),
  stopWhen: stepCountIs(1),
  abortSignal: input.signal,
  maxRetries: 3,
});
```

Then it iterates the model stream:

```ts
for await (const part of result.fullStream) {
  recorder.accept(part);
}
```

`RunStepRecorder` interprets stream parts:

- text start/delta/end
- reasoning start/delta/end
- tool input start/delta
- tool call
- tool result
- tool error
- abort/error

`RunEventWriter` emits harness events for visible assistant messages and tool execution updates.

## 11. Tool Calls Use The Tool Context

Tools are registered in the harness and converted for the model through:

- `packages/agent-harness/src/registries.ts`
- `packages/agent-harness/src/tools/index.ts`
- `packages/agent-harness/src/tools/fs.ts`
- `packages/agent-harness/src/tools/system.ts`
- `packages/agent-harness/src/tools/interaction.ts`

The `toolContext` passed into tools includes:

- workspace root
- current mode
- abort signal
- confirmation callback
- ask-question callback
- emitter
- settings
- providers and tools

Confirmation and question requests route back through:

- `packages/agent-harness/src/ConfirmationRouter.ts`
- `packages/agent-harness/src/harness.ts`

The important callbacks are passed in `buildRunAssembly`:

```ts
confirm: (request) => this.requestConfirmation(request),
askQuestion: (request) => this.requestQuestion(request),
```

## 12. State Returns To The TUI Through Subscription

The TUI subscribes to host state through:

- `apps/tui/src/hooks/useAgentHostClient.ts`

It uses `useSyncExternalStore`:

```ts
const state = useSyncExternalStore(
  useCallback((cb: () => void) => client.subscribe(cb), [client]),
  useCallback(() => client.getState(), [client]),
);
```

When the harness emits events and notifies listeners, `AgentHostClient.getState()` reads:

```ts
this.host.getState()
```

`HarnessAgentHost.getState()` reads:

```ts
return this.harness.getSnapshot();
```

That snapshot contains projected turns, loading state, sessions, mode, and pending confirmation/question state. The TUI then re-renders from the projected transcript.

## Quick Path Summary

```text
User presses Enter
  -> useChatRuntimeInteraction.handleSubmit
  -> useChatSubmission
  -> useAgentHostClient.send
  -> AgentHostClient.send
  -> AgentHost.dispatch({ type: "send" })
  -> HarnessAgentHost.dispatch
  -> AgentHarness.send
  -> buildRunAssembly
  -> EventBus emits user message
  -> RunController.run
  -> runModelStep
  -> RunStepRecorder / RunEventWriter
  -> EventBus/EventStore/projection
  -> harness snapshot
  -> useSyncExternalStore updates TUI
```

## Key Files

- `apps/tui/src/context/AgentHostContext.tsx`
- `apps/tui/src/hooks/useChatInteractionController.ts`
- `apps/tui/src/hooks/useChatRuntimeInteraction.ts`
- `apps/tui/src/hooks/useChatSubmission.ts`
- `apps/tui/src/hooks/useAgentHostClient.ts`
- `packages/client/src/hostActions.ts`
- `packages/client/src/hostContract.ts`
- `packages/agent-host/src/host/HarnessAgentHost.ts`
- `packages/agent-harness/src/harness.ts`
- `packages/agent-harness/src/context/runAssembly.ts`
- `packages/agent-harness/src/run/RunController.ts`
- `packages/agent-harness/src/run/runModelStep.ts`
- `packages/agent-harness/src/run/RunStepRecorder.ts`
- `packages/agent-harness/src/context/RunEventWriter.ts`
- `packages/agent-harness/src/EventBus.ts`
- `packages/agent-harness/src/projection.ts`
- `packages/agent-harness/src/projector/`
