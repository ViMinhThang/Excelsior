# Subagent Tool Flow

This document walks through how the built-in `spawnSubAgent` tool works end to end: how the parent model calls it, how the harness launches a constrained child runner, how child progress streams back as events, how projection turns those events into `sub-agent` transcript blocks, and how the parent model receives the final result.

## Big Picture

`spawnSubAgent` is a focused analysis tool.

The parent agent uses it when a task can be split into a smaller read-only investigation. The child subagent runs in its own `RunController` process with a narrower prompt and a smaller tool set. Its intermediate work is display-only progress for the UI; the parent model receives only the final `spawnSubAgent` tool result.

The high-level path is:

```text
Parent model calls spawnSubAgent
  -> AI SDK executes the harness tool
  -> createSpawnSubAgentTool reads the parent toolCallId
  -> runSpawnedSubAgent starts subagentChildRunner
  -> parent sends child request over stdin
  -> child runs a plan-mode RunController with read-only tools
  -> child writes JSON progress lines to stdout
  -> parent converts lines into SUB_AGENT_EVENT events
  -> projection updates the matching sub-agent block
  -> child exits with final content
  -> parent spawnSubAgent tool resolves with final content
  -> RunEventWriter emits the parent tool result
  -> RunController starts the next parent model step
```

## Tool Registration

`spawnSubAgent` is registered with the built-in tools in `packages/agent-harness/src/tools/index.ts`:

```ts
export function createBuiltInTools(): HarnessTool[] {
  return [
    // ...
    createAskQuestionTool(),
    createSpawnSubAgentTool(),
  ];
}
```

The harness registers those tools during construction:

```ts
for (const tool of createBuiltInTools()) this.tools.register(tool);
```

File:

- `packages/agent-harness/src/harness.ts`

The registry converts each `HarnessTool` into an AI SDK tool in `packages/agent-harness/src/registries.ts`:

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

That `options` object matters because the subagent flow needs the provider's parent `toolCallId` to correlate child progress with the parent transcript block.

## Tool Shape

The tool implementation lives in `packages/agent-harness/src/tools/subAgent.ts`.

Its schema accepts:

- `role: string`
- `prompt: string`

The tool definition is:

```ts
export function createSpawnSubAgentTool(): HarnessTool<z.infer<typeof spawnSubAgentSchema>> {
  return {
    name: "spawnSubAgent",
    description: "Run a focused sub-agent for specialized analysis.",
    inputSchema: spawnSubAgentSchema,
    capabilities: ["sub-agent"],
    async execute(input, ctx, options) {
      const parentToolCallId = options?.toolCallId;
      if (!parentToolCallId) return text(await ctx.sendSubAgent(input));
      return runSpawnedSubAgent({
        role: input.role,
        prompt: input.prompt,
        parentToolCallId,
        ctx,
      });
    },
  };
}
```

There are two paths:

- Normal path: `options.toolCallId` exists, so the harness runs a real spawned child process.
- Fallback path: no parent tool call id exists, so the tool calls `ctx.sendSubAgent(input)` and returns that text.

The fallback is mostly useful for contexts that execute tools outside the normal model tool-call stream.

## Prompting The Parent Model To Use It

The main system prompt explicitly tells the parent model that subagents are available.

File:

- `packages/agent-harness/src/context/systemPrompt.ts`

Relevant rule:

```ts
- Use spawnSubAgent for focused analysis tasks.
```

`buildRunAssembly()` places `sendSubAgent` into the parent tool context:

```ts
toolContext: {
  // ...
  sendSubAgent: async ({ role, prompt }) => {
    const modePrefix = mode === "plan" ? "Plan-only analysis" : "Focused analysis";
    return `${modePrefix} from ${role}:\n${prompt}`;
  },
}
```

File:

- `packages/agent-harness/src/context/runAssembly.ts`

In the normal path, `spawnSubAgent` does not use this fallback because it has a `parentToolCallId`. Instead, it calls `runSpawnedSubAgent()`.

## Parent Tool Execution

The parent run is controlled by the normal model-step loop:

- `packages/agent-harness/src/run/RunController.ts`
- `packages/agent-harness/src/run/runModelStep.ts`
- `packages/agent-harness/src/run/RunStepRecorder.ts`
- `packages/agent-harness/src/context/RunEventWriter.ts`

`runModelStep()` calls `streamText()` with the tool set:

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

When the model calls `spawnSubAgent`, the AI SDK executes the tool. The parent tool call still emits normal tool execution events:

- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- a model-facing tool message containing the final result

The child subagent's live progress is emitted through separate `sub_agent_event` events.

## Launching The Child Runner

The parent launches the child in `packages/agent-harness/src/subagentProcess.ts`.

`runSpawnedSubAgent()` requires two pieces from the parent tool context:

- `ctx.settings`
- `ctx.emit`

If either is missing, it returns an error `ToolResult` immediately:

```ts
if (!settings) return Promise.resolve({ content: "Subagent settings are unavailable.", isError: true });
if (!input.ctx.emit) return Promise.resolve({ content: "Subagent event emitter is unavailable.", isError: true });
```

The child runner path is resolved by `resolveChildRunner()`:

```ts
const workspaceBuiltRunner = join(workspaceRoot, "packages/agent-harness/dist/subagentChildRunner.js");
const workspaceSourceRunner = join(workspaceRoot, "packages/agent-harness/src/subagentChildRunner.ts");
```

Resolution order:

1. workspace built runner
2. workspace source runner through `tsx`
3. built runner beside the current module
4. source runner beside the current module through workspace `tsx`

The command is usually `process.execPath`. In Electron, it uses `node`:

```ts
const isElectron = process.versions.electron !== undefined;
const nodeCommand = isElectron ? "node" : process.execPath;
```

The child process is spawned with:

```ts
const child = spawn(spawnSpec.command, spawnSpec.args, {
  cwd: input.ctx.workspaceRoot,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
  },
});
```

The parent writes a JSON request to child stdin:

```ts
child.stdin.end(JSON.stringify({
  workspaceRoot: input.ctx.workspaceRoot,
  role: input.role,
  prompt: input.prompt,
  settings,
  projectInstructions: input.ctx.projectInstructions,
  skillsList: input.ctx.skillsList,
}));
```

## Child Runner Contract

The child process entry point is `packages/agent-harness/src/subagentChildRunner.ts`.

It reads a single JSON request from stdin:

```ts
interface ChildRequest {
  workspaceRoot: string;
  role: string;
  prompt: string;
  settings: HarnessSettings;
  projectInstructions?: string;
  skillsList?: string;
}
```

It writes newline-delimited JSON objects to stdout:

```ts
type ChildOutput =
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; toolArgs: string }
  | { type: "tool_update"; toolCallId: string; delta: string }
  | { type: "tool_end"; toolCallId: string; toolName: string; toolArgs: string; result: string; isError: boolean }
  | { type: "final"; content: string }
  | { type: "error"; message: string };
```

The parent ignores stdout lines that are not valid JSON.

## Child Tool Context

The child runner creates a new provider registry and a read-only tool registry:

```ts
function createReadOnlyTools(): ToolRegistry {
  const tools = new ToolRegistry();
  for (const tool of [
    createLsTool(),
    createViewTool(),
    createGlobTool(),
    createRipgrepTool(),
  ]) {
    tools.register(tool);
  }
  return tools;
}
```

The child `ToolExecutionContext` is intentionally constrained:

```ts
const ctx: ToolExecutionContext = {
  workspaceRoot: request.workspaceRoot,
  mode: "plan",
  confirm: async (confirmRequest) => ({
    callId: confirmRequest.toolName,
    approved: false,
  }),
  askQuestion: async () => ({
    callId: "subagent-question",
    answer: "",
    isManual: true,
    cancelled: true,
  }),
  sendSubAgent: async () => "Nested subagents are not available inside spawned subagents.",
};
```

The important constraints are:

- child mode is always `plan`
- child tools are read-only
- write-like tools are not registered
- shell commands are not registered
- confirmations are denied
- questions are auto-cancelled
- nested subagents are unavailable

## Child System Prompt

The child system prompt starts with the normal plan-mode system prompt, then appends subagent-specific instructions:

```ts
SUBAGENT ROLE: ${request.role}
- You are a spawned child subagent, not the parent orchestrator.
- Complete only the focused task from the parent.
- Use only read-only inspection tools.
- Do not write files, run shell commands, ask the user questions, or spawn more subagents.
- Return concise findings with exact file paths when relevant.
```

File:

- `packages/agent-harness/src/subagentChildRunner.ts`

Project instructions and the available-skills summary are passed through to the child prompt by the parent request.

## Child Run Loop

The child uses the same `RunController` class as the parent, but with a fresh in-process context:

```ts
await new RunController().run({
  messages: [{ role: "user", content: request.prompt }],
  systemPrompt: buildChildSystemPrompt(request),
  settings: {
    ...request.settings,
    agentToolLoopSteps: "200",
  },
  providers,
  tools,
  toolContext: ctx,
  signal: new AbortController().signal,
  emit,
});
```

Notable differences from the parent run:

- child history starts with only the focused prompt
- child tool-loop limit is forced to `200`
- child events are not written directly into the parent `EventStore`
- child events are translated to stdout JSON by the child's custom emitter

The child captures the latest assistant `MESSAGE_END` content as `finalContent`, then writes:

```ts
writeOutput({ type: "final", content: finalContent || "(no output)" });
```

If the child runner crashes, it writes:

```ts
writeOutput({ type: "error", message });
process.exit(1);
```

## Progress Bridge Back To Parent

The child emitter converts child harness events into `ChildOutput` lines:

- `MESSAGE_UPDATE` -> `text_delta`
- `TOOL_EXECUTION_START` -> `tool_start`
- `TOOL_EXECUTION_UPDATE` -> `tool_update`
- `TOOL_EXECUTION_END` -> `tool_end`
- final assistant `MESSAGE_END` -> captured as final content

The parent reads stdout line by line:

```ts
child.stdout.on("data", (data) => {
  stdoutBuffer += String(data);
  const lines = stdoutBuffer.split(/\r?\n/);
  stdoutBuffer = lines.pop() ?? "";
  for (const line of lines) {
    handleLine(line);
  }
});
```

For each parsed child output, the parent emits a `SUB_AGENT_EVENT`:

```ts
input.ctx.emit?.(SUB_AGENT_EVENT, {
  parentToolCallId: input.parentToolCallId,
  event,
}, { relatedToolCallId: input.parentToolCallId });
```

File:

- `packages/agent-harness/src/subagentProcess.ts`

Text deltas and tool-input deltas are buffered before emission:

```ts
const SUBAGENT_PROGRESS_INTERVAL_MS = 250;
const SUBAGENT_PROGRESS_CHARS = 2048;
```

The parent flushes progress when:

- buffered text reaches 2048 characters
- 250ms have elapsed since the last progress event
- a final/tool-start/tool-end/error event arrives
- the parent finishes or aborts the child

This keeps streaming responsive without writing an event for every tiny token.

## Subagent Events

`SUB_AGENT_EVENT` is defined in `packages/agent-harness/src/events.ts`:

```ts
export const SUB_AGENT_EVENT = "sub_agent_event";
```

Its payload includes the parent tool call id plus a child event:

```ts
[SUB_AGENT_EVENT]: {
  parentToolCallId: string;
  event:
    | { type: "text_delta"; delta: string }
    | { type: "tool_start"; toolCallId: string; toolName: string; toolArgs: string }
    | { type: "tool_update"; toolCallId: string; delta: string }
    | { type: "tool_end"; toolCallId: string; toolName: string; toolArgs: string; result?: string; isError: boolean }
    | { type: "final"; content: string }
    | { type: "error"; message: string };
}
```

These events are stored in the parent session through the normal `EventBus`, so they are available to projection, inspection, replay, and extensions.

## Parent Completion

The parent tracks:

- `stdoutBuffer`
- `stderr`
- `finalOutput`
- pending text deltas
- pending child tool updates
- whether the parent promise has settled

When the child closes with code `0`, the parent resolves the tool result with:

```ts
finish(finalOutput || "(no output)");
```

When the child closes with a non-zero code, the parent resolves an error result with:

```ts
finish(finalOutput || stderr.trim() || `Subagent failed with exit code ${code}.`, true);
```

When the parent abort signal fires:

```ts
child.kill();
finish("Subagent cancelled.", true);
```

If `finish()` receives an error, it also emits a child error event before resolving:

```ts
input.ctx.emit?.(SUB_AGENT_EVENT, {
  parentToolCallId: input.parentToolCallId,
  event: { type: "error", message: content },
}, { relatedToolCallId: input.parentToolCallId });
```

The resolved `ToolResult` is what the parent model sees as the `spawnSubAgent` result.

## Projection Model

The shared projected types live in `packages/core/src/projection.ts`.

Subagents appear in the transcript as a `ProjectedBlock` variant:

```ts
{
  type: "sub-agent";
  id: string;
  role: string;
  state: ProjectedSubAgent;
  timestamp: string;
  isFrozen?: true;
}
```

The state shape is:

```ts
export interface ProjectedSubAgent {
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  toolCalls: ToolCallInfo[];
  parts: SubAgentProjectionPart[];
  startTime?: number;
  endTime?: number;
}
```

`parts` preserves the chronological child output stream:

```ts
export type SubAgentProjectionPart =
  | { type: "text"; text: string }
  | {
      type: "tool-call";
      toolName: string;
      toolArgs: string;
      toolCallId: string;
      status: "pending" | "completed" | "error";
      content?: string;
    };
```

`toolCalls` is a flattened list of child tool calls, useful for summaries and nested tool display.

## Projection Flow

Normal parent tool events are handled by `ToolHandler`.

File:

- `packages/agent-harness/src/projector/ToolHandler.ts`

Tool display block ids are scoped by turn and provider tool id:

```ts
export function toolDisplayBlockId(event: ToolExecutionEvent): string {
  return `${event.turnId ?? event.runId}:${event.data.toolCallId}`;
}
```

When the tool name is `spawnSubAgent`, `toolBlockFromDraft()` returns a `sub-agent` block instead of a generic `tool-call` block:

```ts
if (tool.toolName === "spawnSubAgent") {
  return {
    type: "sub-agent",
    id: tool.id,
    role: readRoleFromToolArgs(tool.toolArgs),
    state: subAgentState ?? buildSubAgentState(tool),
    timestamp: tool.timestamp,
    ...(forceFrozen || tool.status !== "pending" ? { isFrozen: true as const } : {}),
  };
}
```

File:

- `packages/agent-harness/src/projector/utils.ts`

Subagent progress events are handled by `SubAgentHandler`.

File:

- `packages/agent-harness/src/projector/SubAgentHandler.ts`

It builds the same scoped id from `turnId` and the parent tool call id:

```ts
projection.subAgents.apply({
  id: `${event.turnId ?? event.runId}:${event.data.parentToolCallId}`,
  event: event.data.event,
  turnId: event.turnId,
  timestamp: event.timestamp || new Date().toISOString(),
});
```

That id is what lets child progress update the parent `spawnSubAgent` block.

`TranscriptProjection.subAgents.apply()` then:

1. Updates the latest `ProjectedSubAgent` state in `subAgentStates`.
2. If the parent `spawnSubAgent` tool draft is still active, refreshes that active draft.
3. Otherwise updates the existing stored `sub-agent` block.
4. If no block exists yet, creates a fallback `sub-agent` block.

File:

- `packages/agent-harness/src/projector/TranscriptProjection.ts`

The fallback path is recovery for out-of-order or orphaned progress events. In the normal flow, the parent tool-start event creates the block first.

## Updating Subagent State

`updateSubAgentState()` owns the event-to-state rules.

File:

- `packages/agent-harness/src/projector/utils.ts`

State transitions:

- `text_delta`: append to `fullOutput`, update `latestLine`, append or merge a text `part`.
- `tool_start`: add a pending child tool call to `toolCalls` and `parts`.
- `tool_update`: append argument delta to the matching pending child tool call.
- `tool_end`: mark the matching child tool call `completed` or `error` and attach content.
- `final`: mark the subagent `done`, set final output and `endTime`.
- `error`: mark the subagent `error`, append an error line, set `endTime`.

If only the final parent tool result exists and no child progress events exist, `buildSubAgentState()` can still derive a completed subagent display from the parent tool result.

## Model History

Child progress events are not appended directly to model history.

The parent model sees the subagent through the normal parent tool-call protocol:

1. `ToolHandler.finish()` appends an assistant tool call to `AiHistory`.
2. `RunEventWriter.completeTool()` emits a tool message containing the final `spawnSubAgent` result.
3. `MessageHandler` appends that tool message to `AiHistory`.
4. The next parent model step receives both via `toModelMessages()`.

Files:

- `packages/agent-harness/src/projector/AiHistory.ts`
- `packages/agent-harness/src/context/modelMessages.ts`
- `packages/agent-harness/src/context/RunEventWriter.ts`

This design keeps the model context compact:

- UI gets detailed child progress.
- The parent model gets the final child answer as one tool result.

## TUI Rendering

The TUI renders subagents from projected transcript blocks.

Files:

- `apps/tui/src/components/chat/ChatHistory.tsx`
- `apps/tui/src/components/subAgents/SubAgentRow.tsx`
- `apps/tui/src/components/subAgents/SubAgentPickerPanel.tsx`
- `apps/tui/src/components/subAgents/SubAgentDetail.tsx`
- `apps/tui/src/components/subAgents/subAgentDisplay.ts`
- `apps/tui/src/hooks/useSubAgentNavigation.ts`
- `apps/tui/src/chatModes/subAgentPickerMode.ts`
- `apps/tui/src/chatModes/subAgentDetailMode.tsx`

In the main transcript, `ChatHistory` renders a `sub-agent` block as:

```tsx
<SubAgentRow
  agent={block.state}
  role={block.role}
  isSelected={false}
/>
{renderSubAgentTools(block, toolsExpanded)}
```

Nested child tools are shown under the subagent row. When tools are collapsed, only the last two child tool calls are shown:

```ts
const visibleTools = expanded ? tools : tools.slice(-2);
```

`SubAgentRow` shows:

- cleaned role
- status: `running`, `done`, or `error`
- elapsed duration
- current activity

`getSubAgentActivity()` prefers the latest running child tool. If no child tool is running, it shows the latest output line or the child tool count.

`useSubAgentNavigation()` extracts all `sub-agent` blocks from turns:

```ts
const subAgentBlocks = useMemo(
  () => turns.flatMap((t) => t.blocks).filter((block): block is SubAgentBlock => block.type === "sub-agent"),
  [turns],
);
```

The picker and detail modes are already modeled:

- picker: list subagents, move with Up/Down, Enter opens detail, Esc closes
- detail: render text/tool parts for the selected subagent, Esc returns to picker
- Ctrl+O toggles child tool visibility in picker/detail

The standard input mode currently uses Ctrl+O for tool expansion. The subagent picker/detail state is fed by `useSubAgentNavigation()` once opened by a caller.

## Desktop Rendering

Desktop uses the same projected `sub-agent` block, but renders a simpler bubble.

File:

- `apps/desktop/src/renderer/components/chatPanel/transcriptBubbles.tsx`

The `SubAgentBubble` shows:

- a compass icon
- a loading/completed status dot
- the subagent role
- `is running...` while running
- `finished (${block.state.status})` after completion

Desktop does not currently expose the same nested child tool detail view as the TUI transcript.

## Display Formatting

The shared tool display registry has a display config for `spawnSubAgent`.

Files:

- `packages/core/src/conversationPresentation/toolDisplayRegistry.ts`
- `packages/core/src/conversationPresentation/miscToolDisplays.ts`
- `packages/core/src/conversationPresentation/toolArgs.ts`

The command formatter is:

```ts
export const spawnSubAgentDisplayConfig: ToolDisplayConfig = {
  formatCommand: (args: Record<string, unknown> | null) => {
    return `subagent ${String(args?.role || args?.TaskSummary || "")}`;
  },
};
```

`readRoleFromToolArgs()` extracts the displayed role from the parent tool args:

```ts
export function readRoleFromToolArgs(rawArgs: string): string {
  try {
    const parsed = JSON.parse(rawArgs) as { role?: unknown };
    return typeof parsed.role === "string" && parsed.role.trim()
      ? parsed.role
      : "SubAgent";
  } catch {
    return rawArgs || "SubAgent";
  }
}
```

`normalizeSubAgentToolArgs()` keeps malformed JSON from breaking presentation logic by falling back to the raw string.

## Cancellation And Failure

There are several failure paths:

- Missing parent settings: the tool returns `Subagent settings are unavailable.` as an error.
- Missing parent event emitter: the tool returns `Subagent event emitter is unavailable.` as an error.
- Runner command missing: the tool returns `Subagent runner not found: ...` as an error.
- Child process spawn failure: the tool returns `Subagent runner failed: ...` as an error.
- Child non-zero exit: the tool returns final output, stderr, or `Subagent failed with exit code N.` as an error.
- Parent run cancellation: the parent kills the child and returns `Subagent cancelled.` as an error.

On error, the parent emits a `sub_agent_event` with:

```ts
{ type: "error", message: content }
```

Projection marks the subagent state as `error`, appends `Error: ...` to the displayed output, and freezes the block when the parent tool finishes.

## Testing Coverage

Current targeted coverage includes:

- `packages/agent-harness/__tests__/projection.test.ts`
  - `spawnSubAgent` projects as `sub-agent`
  - live child text/tool progress becomes nested parts
  - parallel child progress stays scoped by parent tool call
- `packages/agent-harness/__tests__/context.test.ts`
  - run assembly exposes the fallback `sendSubAgent`
  - project instructions and mode are assembled into tool context
- `packages/core/__tests__/toolArgs.test.ts`
  - malformed subagent args do not break presentation normalization
- `apps/tui/__tests__/chatHistory.test.ts`
  - subagent nested tools render in collapsed and expanded transcript states

Many runtime tests also stub `sendSubAgent` in `ToolExecutionContext`, which keeps the subagent context field exercised while testing the broader run loop.

## Files To Read

Start with the tool and child process:

- `packages/agent-harness/src/tools/subAgent.ts`
- `packages/agent-harness/src/subagentProcess.ts`
- `packages/agent-harness/src/subagentChildRunner.ts`
- `packages/agent-harness/src/types.ts`
- `packages/agent-harness/src/events.ts`

Then read parent run assembly and execution:

- `packages/agent-harness/src/context/systemPrompt.ts`
- `packages/agent-harness/src/context/runAssembly.ts`
- `packages/agent-harness/src/registries.ts`
- `packages/agent-harness/src/run/RunController.ts`
- `packages/agent-harness/src/run/runModelStep.ts`
- `packages/agent-harness/src/run/RunStepRecorder.ts`
- `packages/agent-harness/src/context/RunEventWriter.ts`

Then read projection:

- `packages/core/src/projection.ts`
- `packages/agent-harness/src/projector/ToolHandler.ts`
- `packages/agent-harness/src/projector/SubAgentHandler.ts`
- `packages/agent-harness/src/projector/TranscriptProjection.ts`
- `packages/agent-harness/src/projector/LiveDrafts.ts`
- `packages/agent-harness/src/projector/utils.ts`
- `packages/agent-harness/src/projector/AiHistory.ts`

Then read UI presentation:

- `apps/tui/src/components/chat/ChatHistory.tsx`
- `apps/tui/src/components/subAgents/SubAgentRow.tsx`
- `apps/tui/src/components/subAgents/SubAgentPickerPanel.tsx`
- `apps/tui/src/components/subAgents/SubAgentDetail.tsx`
- `apps/tui/src/components/subAgents/subAgentDisplay.ts`
- `apps/tui/src/hooks/useSubAgentNavigation.ts`
- `apps/tui/src/chatModes/subAgentPickerMode.ts`
- `apps/tui/src/chatModes/subAgentDetailMode.tsx`
- `apps/desktop/src/renderer/components/chatPanel/transcriptBubbles.tsx`
- `packages/core/src/conversationPresentation/miscToolDisplays.ts`
- `packages/core/src/conversationPresentation/toolArgs.ts`

## Mental Model

When debugging subagents, follow the parent tool call id.

1. The parent model emits a `spawnSubAgent` tool call.
2. `RunEventWriter` starts a normal parent tool with a provider `toolCallId`.
3. `createSpawnSubAgentTool()` receives that id as `options.toolCallId`.
4. `runSpawnedSubAgent()` starts the child process and tags every child progress event with `parentToolCallId`.
5. `SubAgentHandler` scopes the display id as `turnId:parentToolCallId`.
6. `ToolHandler` uses the same id for the parent `spawnSubAgent` block.
7. `TranscriptProjection` merges child progress into that block's `ProjectedSubAgent` state.
8. The parent tool resolves with final child output.
9. The next parent model step sees only the final tool result.

If a subagent does not appear in the UI, inspect the parent `tool_execution_start` for `spawnSubAgent`. If the row appears but does not update, inspect `sub_agent_event.data.parentToolCallId` and the event `turnId`. If the model does not continue, inspect the parent `tool_execution_end` and the final tool message for the `spawnSubAgent` call.
