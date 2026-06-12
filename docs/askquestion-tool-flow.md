# AskQuestion Tool Flow

This document walks through how the built-in `askQuestion` tool works end to end: how the model sees it, how the harness turns a tool call into a pending UI prompt, how the user response gets back to the blocked tool execution, and how the agent loop continues afterward.

## Big Picture

`askQuestion` is a blocking interaction tool.

The agent uses it when it needs a user decision before continuing. Unlike normal assistant text, a question is not rendered from transcript projection. It is held as `pendingQuestion` on the harness snapshot, shown by the UI as a modal-like prompt, and resolved through the host contract.

The high-level path is:

```text
Model calls askQuestion
  -> AI SDK executes harness tool
  -> tool calls ctx.askQuestion(...)
  -> harness creates callId and stores resolver
  -> harness emits question_requested
  -> harness snapshot exposes pendingQuestion
  -> TUI/Desktop renders prompt
  -> user answers or cancels
  -> UI dispatches respond-to-question
  -> harness resolves matching callId
  -> harness emits question_answered
  -> tool returns answer text to the model
  -> RunController starts the next model step
```

## Shared Data Contract

The shared types live in `packages/core/src/question.ts`.

```ts
export interface AskQuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface AskQuestionRequest {
  callId: string;
  question: string;
  options: AskQuestionOption[];
  allowManual: boolean;
}

export interface AskQuestionResponse {
  callId: string;
  answer: string;
  selectedOptionId?: string;
  selectedOptionLabel?: string;
  isManual: boolean;
  cancelled?: boolean;
}
```

Important fields:

- `callId` correlates the visible pending question with the suspended promise inside the harness.
- `question` is the text shown to the user.
- `options` are structured choices. They are optional at tool-call time but normalized to an array before the harness stores the request.
- `allowManual` controls whether free-form text is valid.
- `answer` is always the text answer returned to the model-facing tool result.
- `selectedOptionId` and `selectedOptionLabel` are present only when the user picked a structured option.
- `isManual` distinguishes a typed answer from an option selection.
- `cancelled` lets the tool return a cancellation result without pretending a real answer was chosen.

## Tool Registration

`askQuestion` is registered with the built-in tools in `packages/agent-harness/src/tools/index.ts`:

```ts
export function createBuiltInTools(): HarnessTool[] {
  return [
    // ...
    createAskQuestionTool(),
    createSpawnSubAgentTool(),
  ];
}
```

When the harness is constructed, it registers every built-in tool:

```ts
for (const tool of createBuiltInTools()) this.tools.register(tool);
```

File:

- `packages/agent-harness/src/harness.ts`

The registry later converts harness tools into AI SDK tools in `packages/agent-harness/src/registries.ts`:

```ts
result[harnessTool.name] = tool({
  description: harnessTool.description,
  inputSchema: harnessTool.inputSchema,
  execute: async (input, options) => {
    const parsed = harnessTool.inputSchema.parse(input);
    const output = await harnessTool.execute(parsed, ctx, options);
    if (output.isError) {
      throw new Error(output.content);
    }
    return output.content;
  },
});
```

That conversion is where the harness tool becomes callable by the model during `streamText`.

## Tool Shape

The tool implementation lives in `packages/agent-harness/src/tools/interaction.ts`.

Its schema accepts:

- `question: string`
- `options?: Array<{ id: string; label: string; description?: string }>`
- `allowManual?: boolean`

The implementation normalizes omitted fields:

```ts
const response = await ctx.askQuestion({
  question,
  options: options ?? [],
  allowManual: allowManual ?? true,
});
```

So if the model only supplies a question, the user can type a manual answer by default.

After the user responds, the tool returns plain text to the model:

```ts
if (response.cancelled) return text("Question cancelled.");
return text(response.selectedOptionLabel ?? response.answer);
```

This is deliberate. The model-facing tool result is compact and human-readable, while the richer structured response is still recorded in harness events.

## Prompting The Model To Use It

The system prompt explicitly tells the model when to use the tool.

File:

- `packages/agent-harness/src/context/systemPrompt.ts`

Relevant rule:

```ts
- Use askQuestion when a user decision is required.
```

The system prompt is built for each run through `buildRunAssembly()`.

File:

- `packages/agent-harness/src/context/runAssembly.ts`

That assembly passes the harness question callback into the tool context:

```ts
toolContext: {
  // ...
  askQuestion: input.askQuestion,
}
```

And the harness supplies that callback from `send()`:

```ts
askQuestion: (request) => this.requestQuestion(request),
```

## Model Step Execution

Agent execution is controlled by `RunController`.

Files:

- `packages/agent-harness/src/run/RunController.ts`
- `packages/agent-harness/src/run/runModelStep.ts`
- `packages/agent-harness/src/run/RunStepRecorder.ts`
- `packages/agent-harness/src/context/RunEventWriter.ts`

`RunController.run()` loops one model step at a time:

```ts
const step = await runModelStep({
  messages: activeMessages,
  systemPrompt: input.systemPrompt,
  tools: input.tools.toToolSet(input.toolContext),
  toolContext: input.toolContext,
  // ...
});

activeMessages.push(...step.messages);

if (!step.hasToolCalls) {
  break;
}
```

`runModelStep()` calls `streamText()` with a one-step stop condition:

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

When the model calls `askQuestion`, the AI SDK invokes the tool's `execute()` function. That function awaits `ctx.askQuestion()`, so the model step pauses until the user responds or the question is cancelled.

While the tool input streams in, `RunStepRecorder` and `RunEventWriter` emit normal tool execution events:

- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- a tool `message_start` / `message_end` pair containing the tool result

The special question events are separate from the normal tool execution events.

## Creating The Pending Question

The harness creates pending questions in `requestQuestion()`.

File:

- `packages/agent-harness/src/harness.ts`

```ts
private requestQuestion(input: Omit<AskQuestionRequest, "callId">): Promise<AskQuestionResponse> {
  return new Promise((resolveResponse) => {
    const callId = randomUUID();
    const active = this.activeRun.currentIdentity();
    const runId = active?.runId ?? `run_${randomUUID()}`;
    const turnId = active?.turnId;
    const sessionId = active?.sessionId ?? this.sessionManager.currentSession()?.id;
    const request = { callId, ...input };

    this.confirmRouter.addQuestion(request, (response) => {
      if (sessionId) {
        this.eventBus.emit(runId, QUESTION_ANSWERED, { response }, { sessionId, turnId });
      }
      resolveResponse(response);
      this.notify();
    });

    if (sessionId) {
      this.eventBus.emit(runId, QUESTION_REQUESTED, { request }, { sessionId, turnId });
    }
    this.notify();
  });
}
```

This method does four things:

1. Generates a fresh `callId`.
2. Captures the active run, turn, and session identity so answer events are tied to the correct turn.
3. Stores the pending request and resolver in `ConfirmationRouter`.
4. Emits `question_requested` and schedules a snapshot update.

The returned promise is the thing blocking the tool execution.

## Routing Pending Questions

`ConfirmationRouter` handles both tool confirmations and questions.

File:

- `packages/agent-harness/src/ConfirmationRouter.ts`

For questions, it owns a `PendingRequestRoute<AskQuestionRequest, AskQuestionResponse>`:

```ts
private readonly questions = new PendingRequestRoute<AskQuestionRequest, AskQuestionResponse>(
  (callId) => ({
    callId,
    answer: "",
    isManual: true,
    cancelled: true,
  }),
);
```

Each route keeps:

- `pending`: the request currently exposed to clients.
- `resolvers`: a map from `callId` to the promise resolver waiting inside `requestQuestion()`.

Adding a question sets the visible pending request:

```ts
add(callId: string, request: TRequest, resolver: (response: TResponse) => void): void {
  this.pending = request;
  this.resolvers.set(callId, resolver);
}
```

Resolving a question finds the matching resolver by `callId`, clears the visible pending prompt, and resumes the blocked promise:

```ts
resolve(callId: string, response: TResponse): void {
  const resolver = this.resolvers.get(callId);
  if (!resolver) return;
  this.resolvers.delete(callId);
  this.pending = null;
  resolver(response);
}
```

Current design note: the router can remember multiple resolvers, but only one question is exposed as `pending` at a time. The UI is therefore designed around one active question prompt.

## Events And Snapshot State

Question events are defined in `packages/agent-harness/src/events.ts`:

```ts
export const QUESTION_REQUESTED = "question_requested";
export const QUESTION_ANSWERED = "question_answered";
```

Their payloads are:

```ts
[QUESTION_REQUESTED]: { request: AskQuestionRequest };
[QUESTION_ANSWERED]: { response: AskQuestionResponse };
```

Those events are stored through `EventBus` and `EventStore` like other harness events, which makes them visible to tracing, replay, extensions, and inspection.

The UI, however, does not discover pending questions by projecting those events. `Projector` registers handlers for message, tool, sub-agent, reasoning, and lifecycle events, but not `question_requested` or `question_answered`.

Instead, pending question state is attached directly to the snapshot:

```ts
this.snapshot = projectHarnessState({
  // ...
  pendingConfirmation: this.confirmRouter.pendingConfirmation,
  pendingQuestion: this.confirmRouter.pendingQuestion,
});
```

File:

- `packages/agent-harness/src/harness.ts`

The shared client state type includes that field:

```ts
export interface AgentClientState {
  // ...
  pendingQuestion: AskQuestionRequest | null;
}
```

File:

- `packages/core/src/clientState.ts`

This split is important:

- Events are the durable audit trail.
- `pendingQuestion` is the live UI prompt.
- The eventual answer reaches the transcript/model history as a normal tool result, not as a special projected question block.

## Host Contract

The host contract exposes a question response intent.

File:

- `packages/client/src/hostContract.ts`

```ts
| { type: "respond-to-question"; response: AskQuestionResponse }
```

The client wrapper sends that intent:

```ts
async respondToQuestion(response: AskQuestionResponse): Promise<void> {
  await this.host.dispatch({ type: "respond-to-question", response });
}
```

File:

- `packages/client/src/hostActions.ts`

`HarnessAgentHost` receives the intent and forwards it to the harness:

```ts
case "respond-to-question":
  this.harness.respondToQuestion(intent.response);
  return none();
```

File:

- `packages/agent-host/src/host/HarnessAgentHost.ts`

The harness then resolves it through the router:

```ts
respondToQuestion(response: AskQuestionResponse): void {
  this.confirmRouter.resolveQuestion(response);
}
```

## TUI Rendering And Response

The TUI subscribes to host state in `apps/tui/src/hooks/useAgentHostClient.ts` with `useSyncExternalStore()`. The state includes `pendingQuestion`.

`useChatInteractionController()` passes that pending request into `useQuestionResponse()`:

```ts
const question = useQuestionResponse(
  pendingQuestion,
  agent.respondToQuestion,
);
```

File:

- `apps/tui/src/hooks/useChatInteractionController.ts`

`useQuestionResponse()` owns local answer input state and converts user input into `AskQuestionResponse`.

File:

- `apps/tui/src/hooks/useQuestionResponse.ts`

It accepts structured choices by:

- 1-based option number.
- option id, case-insensitive.
- option label, case-insensitive.

```ts
const optionByNumber = pending.options[Number(answer) - 1];
const normalizedAnswer = normalized(answer);
const option =
  optionByNumber ??
  pending.options.find((candidate) =>
    normalized(candidate.id) === normalizedAnswer ||
    normalized(candidate.label) === normalizedAnswer
  );
```

If an option matches, the TUI returns a structured response:

```ts
return {
  callId: pending.callId,
  answer: option.label,
  selectedOptionId: option.id,
  selectedOptionLabel: option.label,
  isManual: false,
};
```

If no option matches and manual answers are allowed, it returns:

```ts
return {
  callId: pending.callId,
  answer,
  isManual: true,
};
```

If no option matches and `allowManual` is false, the response is rejected locally by returning `null`.

Cancellation sends:

```ts
{
  callId: pending.callId,
  answer: "",
  isManual: true,
  cancelled: true,
}
```

The visible prompt is rendered by `PendingQuestionPanel`.

File:

- `apps/tui/src/components/chat/PendingQuestionPanel.tsx`

It shows:

- the question text
- numbered options and descriptions
- a focused input
- a placeholder that changes based on `allowManual`

`ChatScreen` places the pending question panel under the transcript:

```tsx
{screen.pendingQuestion && (
  <box flexShrink={0} width="100%">
    <PendingQuestionPanel {...screen.pendingQuestion} />
  </box>
)}
```

File:

- `apps/tui/src/screens/ChatScreen.tsx`

The TUI keymap also treats pending questions as modal prompts:

- `Enter` submits the answer through the focused input.
- `Esc` cancels the question.
- The footer hint says `Enter answer | type option number or custom answer | Esc cancel`.

Files:

- `apps/tui/src/hooks/useChatKeymaps.ts`
- `apps/tui/src/chatModes/hints.ts`

## Desktop Rendering And Response

The Desktop app uses the same shared host contract, but the host is reached over Electron IPC.

Main process:

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/workspaceHost.ts`
- `apps/desktop/src/main/preload.ts`

Renderer:

- `apps/desktop/src/renderer/hooks/desktopHostStore.ts`
- `apps/desktop/src/renderer/hooks/useAgentHost.ts`
- `apps/desktop/src/renderer/components/ChatPanel.tsx`
- `apps/desktop/src/renderer/components/chatPanel/PendingPrompts.tsx`

The main process owns a `DesktopWorkspaceHost`, which creates a `HarnessAgentHost` per selected workspace:

```ts
this.agentHost = new HarnessAgentHost({ workspaceRoot: rootPath });
this.stateChangeUnsubscribe = this.agentHost.subscribe(() => {
  if (this.agentHost) {
    this.onStateChanged(this.agentHost.getState());
  }
});
```

Renderer state changes arrive through `host:state-changed`. Dispatches go back through `host:dispatch`:

```ts
dispatch: (intent: AgentHostIntent): Promise<AgentHostDispatchResult> =>
  ipcRenderer.invoke("host:dispatch", intent),
```

From there, `AgentHostClient.respondToQuestion()` sends the same `respond-to-question` intent used by the TUI.

`ChatPanel` renders `PendingQuestion` whenever `state.pendingQuestion` is present:

```tsx
{state?.pendingQuestion && (
  <PendingQuestion
    question={state.pendingQuestion}
    onRespond={onRespondToQuestion}
  />
)}
```

The Desktop `PendingQuestion` component differs from the TUI in interaction style:

- options are clickable buttons
- manual answers use a textarea
- `Enter` submits a manual answer unless `Shift` is held
- Cancel sends a cancelled response

Option responses have the same shape:

```ts
{
  callId: question.callId,
  answer: option.label,
  selectedOptionId: option.id,
  selectedOptionLabel: option.label,
  isManual: false,
}
```

Manual responses have the same shape:

```ts
{
  callId: question.callId,
  answer,
  isManual: true,
}
```

## Returning To The Model

When the user responds, the resolver stored by `requestQuestion()` runs.

That does three things:

1. Emits `question_answered`.
2. Resolves the promise returned by `ctx.askQuestion()`.
3. Notifies subscribers so `pendingQuestion` disappears from the snapshot.

Then `createAskQuestionTool()` converts the response into a tool result string:

```ts
if (response.cancelled) return text("Question cancelled.");
return text(response.selectedOptionLabel ?? response.answer);
```

The AI SDK emits a `tool-result` part for that tool call. `RunStepRecorder` records it and `RunEventWriter.completeTool()` emits `tool_execution_end` plus the model-facing tool message.

At the end of the step, `RunController` appends the assistant tool call and tool result messages to `activeMessages`.

Because the step had a tool call, `RunController` loops again. The next model step receives the tool result in message history and can continue with the answer.

## Cancellation Paths

There are two relevant cancellation paths.

Question-level cancellation:

- TUI: `Esc` while a question is pending.
- Desktop: the `Cancel` button.
- Response shape: `{ callId, answer: "", isManual: true, cancelled: true }`.
- The tool result becomes `Question cancelled.`.
- The run can continue; the model decides what to do with that cancellation result.

Run-level cancellation:

- TUI/Desktop call the normal `cancel` host action.
- `HarnessStore.cancel()` aborts the active run and calls `this.confirmRouter.cancelAll()`.
- The question resolver receives the router's cancellation response.
- `ActiveRunManager` finalizes the run as cancelled.

The router's default question cancellation response is:

```ts
{
  callId,
  answer: "",
  isManual: true,
  cancelled: true,
}
```

## Why The Tool Returns Text Instead Of JSON

The response is structured inside the application so the UI and event log can preserve how the user answered. The tool result returned to the model is intentionally simple:

- selected option: return the option label
- manual answer: return the manual answer text
- cancelled question: return `Question cancelled.`

This keeps future model steps easy to condition on without forcing every prompt to parse application-specific JSON.

If a future feature needs the model to distinguish option id from label, the current implementation would need to change the tool result format, not just the UI response type.

## Testing Coverage

Current targeted coverage includes:

- `apps/tui/__tests__/questionResponse.test.ts`
  - option number mapping
  - option id and label matching
  - manual answer handling
  - rejection when manual answers are disabled
- `packages/client/__tests__/clientHost.test.ts`
  - `AgentHostClient.respondToQuestion()` dispatches the `respond-to-question` intent

Many harness tests also stub `askQuestion` in `ToolExecutionContext`, which keeps the built-in tool context shape exercised while testing other tools and run-controller behavior.

## Files To Read

Start with the shared contract and tool implementation:

- `packages/core/src/question.ts`
- `packages/core/src/clientState.ts`
- `packages/agent-harness/src/tools/interaction.ts`
- `packages/agent-harness/src/tools/index.ts`
- `packages/agent-harness/src/types.ts`

Then read the harness execution and routing path:

- `packages/agent-harness/src/harness.ts`
- `packages/agent-harness/src/ConfirmationRouter.ts`
- `packages/agent-harness/src/events.ts`
- `packages/agent-harness/src/context/runAssembly.ts`
- `packages/agent-harness/src/context/systemPrompt.ts`
- `packages/agent-harness/src/registries.ts`
- `packages/agent-harness/src/run/RunController.ts`
- `packages/agent-harness/src/run/runModelStep.ts`
- `packages/agent-harness/src/run/RunStepRecorder.ts`
- `packages/agent-harness/src/context/RunEventWriter.ts`

Then read the host contract:

- `packages/client/src/hostContract.ts`
- `packages/client/src/hostActions.ts`
- `packages/agent-host/src/host/HarnessAgentHost.ts`

Then read the UIs:

- `apps/tui/src/hooks/useAgentHostClient.ts`
- `apps/tui/src/hooks/useChatInteractionController.ts`
- `apps/tui/src/hooks/useQuestionResponse.ts`
- `apps/tui/src/hooks/chatScreenViewModel.ts`
- `apps/tui/src/components/chat/PendingQuestionPanel.tsx`
- `apps/tui/src/screens/ChatScreen.tsx`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/preload.ts`
- `apps/desktop/src/main/workspaceHost.ts`
- `apps/desktop/src/renderer/hooks/desktopHostStore.ts`
- `apps/desktop/src/renderer/hooks/useAgentHost.ts`
- `apps/desktop/src/renderer/components/ChatPanel.tsx`
- `apps/desktop/src/renderer/components/chatPanel/PendingPrompts.tsx`

## Mental Model

When debugging `askQuestion`, follow the `callId`.

1. The model emits an `askQuestion` tool call.
2. The tool awaits `ctx.askQuestion()`.
3. `requestQuestion()` adds a resolver under a generated `callId`.
4. The snapshot exposes the same `callId` in `pendingQuestion`.
5. The UI sends `respond-to-question` with that `callId`.
6. `ConfirmationRouter.resolveQuestion()` resumes the exact resolver.
7. The tool result is returned to the model.
8. The run loop starts the next step with that tool result in history.

If the UI shows no prompt, inspect `snapshot.pendingQuestion`. If the prompt shows but answering does nothing, inspect the response `callId`. If the model never continues, inspect whether the pending promise was resolved and whether `RunStepRecorder` received the tool result.
