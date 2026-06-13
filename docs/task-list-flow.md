# Task List Flow

This document explains how Excelsior's visible task checklist works, from the `updateTasks` tool call to the sticky TUI panel above the chat input.

## Big Picture

The task list is live harness state projected from `tasks_updated` events. It is not a transcript block.

The important behaviors are:

- the agent updates the list by calling the built-in `updateTasks` tool
- every `updateTasks` call replaces the whole visible checklist
- tasks are projected as side-channel state next to transcript turns
- task updates do not enter model history as assistant/user transcript content
- the TUI renders tasks as a sticky panel above the chat input
- an empty task array clears the checklist

The high-level path is:

```text
Agent calls updateTasks
  -> createUpdateTasksTool validates and normalizes task items
  -> tool emits TASKS_UPDATED
  -> EventStore persists the event like any other harness event
  -> Projector routes TASKS_UPDATED to TaskHandler
  -> TranscriptProjection replaces taskItems
  -> AgentClientState.tasks receives the projected list
  -> TUI view model passes tasks into ConversationView
  -> TaskList renders above ChatInput
```

## Main Files

Tool and event layer:

- `packages/agent-harness/src/tools/tasks.ts`
- `packages/agent-harness/src/tools/index.ts`
- `packages/agent-harness/src/events.ts`
- `packages/agent-harness/src/context/systemPrompt.ts`

Projection layer:

- `packages/agent-harness/src/projector/TaskHandler.ts`
- `packages/agent-harness/src/projector/Projector.ts`
- `packages/agent-harness/src/projector/TranscriptProjection.ts`
- `packages/agent-harness/src/projection.ts`
- `packages/core/src/projection.ts`
- `packages/core/src/clientState.ts`

TUI layer:

- `apps/tui/src/hooks/useChatInteractionController.ts`
- `apps/tui/src/hooks/chatScreenViewModel.ts`
- `apps/tui/src/chatModes/conversationView.tsx`
- `apps/tui/src/components/chat/TaskList.tsx`

Tests:

- `packages/agent-harness/__tests__/tools.test.ts`
- `packages/agent-harness/__tests__/projection.test.ts`
- `apps/tui/__tests__/taskList.test.ts`
- `apps/tui/__tests__/chatScreenViewModel.test.ts`

## Task Data Model

The shared task type lives in `packages/core/src/projection.ts`:

```ts
export type ProjectedTaskStatus = "todo" | "in-progress" | "done";

export interface ProjectedTask {
  id: string;
  text: string;
  status: ProjectedTaskStatus;
}
```

The client snapshot includes tasks as optional side-channel state:

```ts
export interface AgentClientState {
  turns: ProjectedTurn[];
  tasks?: ProjectedTask[];
  // ...
}
```

The TUI normalizes this optional value to an empty array before rendering:

```ts
tasks: tasks ?? []
```

## System Prompt Contract

The system prompt tells the agent when to use the task list.

For Act mode implementation work, it says to call `updateTasks` before editing and keep the checklist current. It also tells the agent to mark exactly one active task as `in-progress` when possible, then mark completed tasks as `done`.

The tool rule section reinforces the user-facing purpose:

```text
Use updateTasks for user-visible implementation progress; it updates the sticky TUI checklist above the chat input.
```

This is a convention enforced by prompt policy, not by the tool schema. The schema allows any number of `in-progress` tasks, but the agent is instructed to keep the list readable.

## Tool Registration

`updateTasks` is a built-in harness tool.

`createBuiltInTools()` registers it with the other built-ins:

```ts
createUpdateTasksTool()
```

The tool definition is:

```ts
name: "updateTasks"
description: "Replace the visible TUI task checklist for the current turn. Use this before and during implementation work."
```

The input schema is:

```ts
{
  tasks: Array<{
    id?: string;
    text: string;
    status: "todo" | "in-progress" | "done";
  }>
}
```

## Tool Execution

`createUpdateTasksTool()` maps tool input into projected tasks.

If a task has no `id`, the tool assigns a stable positional fallback for that one call:

```text
task_1
task_2
task_3
```

Then it emits:

```ts
ctx.emit?.(TASKS_UPDATED, { tasks: projected });
```

The tool result is plain text:

- `Updated N tasks.` when the array is non-empty
- `Cleared task checklist.` when the array is empty

Because `ctx.emit` is optional, the tool can still return a result in tests or alternate contexts without event emission. In normal harness runs, `ctx.emit` is supplied by `buildRunAssembly()`.

## Event Shape

The event type is declared in `packages/agent-harness/src/events.ts`:

```ts
export const TASKS_UPDATED = "tasks_updated";
```

Its event data is:

```ts
[TASKS_UPDATED]: { tasks: ProjectedTask[] };
```

Task updates are normal harness events. They receive workspace/session/run metadata, sequence, timestamp, and turn information from the same event emitter used by tool execution.

## Projection

`Projector` registers `TaskHandler` with the other projection handlers:

```ts
new TaskHandler()
```

`TaskHandler` handles only `TASKS_UPDATED`:

```ts
projection.tasks.replace({ tasks: event.data.tasks });
```

`TranscriptProjection` stores the current checklist in a private field:

```ts
private taskItems: ProjectedTask[] = [];
```

The task projection interface is intentionally small:

```ts
public readonly tasks = {
  replace: (input: { tasks: ProjectedTask[] }) => {
    this.taskItems = input.tasks;
  },
};
```

This means each update replaces the whole checklist. There is no merge, patch, append, or per-task mutation operation.

## Snapshot Output

`TranscriptProjection.snapshot()` returns:

```ts
{
  turns: this.drafts.materialize(),
  tasks: this.taskItems,
  aiHistory: this.history.snapshot(),
}
```

`packages/agent-harness/src/projection.ts` passes `readModel.tasks` into `projectHarnessState()`, which builds `AgentClientState`.

The important distinction is that `tasks` live beside `turns`.

The projection test asserts this directly:

```text
TASKS_UPDATED affects model.tasks
TASKS_UPDATED does not create transcript blocks
```

## Reset Behavior

`TranscriptProjection.reset()` clears tasks:

```ts
this.taskItems = [];
```

Projection reset happens when the projector cannot apply events incrementally and needs to replay from scratch. Since task updates are persisted events, replaying the event stream restores the latest task list from the last `TASKS_UPDATED` event in that stream.

The list also clears when the agent emits:

```ts
updateTasks({ tasks: [] })
```

That is the normal explicit clearing mechanism.

## TUI View Model

`useChatInteractionController()` reads tasks from the agent host state:

```ts
const { turns, tasks, ... } = agent.state;
```

Then it passes tasks into `buildModeViewContext()`:

```ts
tasks: tasks ?? []
```

The mode view context stores them under:

```text
ctx.transcript.tasks
```

This puts task state on the same view model branch as transcript state without making tasks part of transcript blocks.

## TUI Placement

`ConversationView` renders the task list only when there is no active feature panel.

The placement is:

```text
transcript scrollbox
optional ThinkingIndicator
active feature panel OR:
  TaskList
  ChatInput
  mode/footer hints
```

So the task list is sticky near the input, not embedded at the point where `updateTasks` was called.

This placement is why task updates work as progress status: the user can keep typing and still see the current checklist.

## TUI Rendering

`TaskList` returns `null` when the task array is empty.

When tasks exist, it renders a `Panel` titled:

```text
Tasks
```

Each task row has a status prefix:

- `todo` -> `[ ]`
- `in-progress` -> `[/]`
- `done` -> `[x]`

Styling policy:

- `in-progress` uses the Act-mode hint color, bold prefix, and normal text color
- `todo` uses muted color and dim text
- `done` uses muted color, dim text, and italic task text

The task `id` is used as the React key.

## Interaction Model

The task list is display-only.

Users do not edit tasks directly in the TUI. The agent updates the list by calling `updateTasks`, and the user sees the latest replacement list.

There are no task-specific keybindings. The panel is part of the chat input area and does not own keyboard focus.

## Relationship To Transcript And Model History

Task updates are not user or assistant messages. They do not create `ProjectedBlock` entries and do not render inside the transcript scrollback.

The `updateTasks` tool still has a normal tool result, so the model can observe that the tool call succeeded. The separate `TASKS_UPDATED` event exists so the UI can render a clean checklist instead of asking users to read raw tool output.

This keeps the module deep: one small tool interface gives the agent durable user-visible progress display, while the projection and TUI keep checklist state out of normal transcript layout.

## Important Boundaries

The task list is a current-state projection, not a historical audit view.

If the agent updates the checklist several times during a run, the TUI shows the latest projected list. Historical updates remain in the event stream for replay/debugging, but the user-facing panel is intentionally the current state only.
