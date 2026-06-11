# TUI Block Render Flow

This document walks through how projected transcript blocks become visible UI in the terminal.

The projection layer produces `ProjectedTurn[]`. The TUI does not replay events directly. It receives the already-projected client state, optionally adds a temporary optimistic user block, and renders each `ProjectedBlock` by switching on `block.type`.

## Data Shape

The block types are defined in `packages/core/src/projection.ts`.

`ProjectedTurn` is the outer unit:

```ts
export interface ProjectedTurn {
  id: string;
  status: "in-progress" | "completed" | "interrupted" | "failed";
  blocks: ProjectedBlock[];
  error?: { message: string };
  startTime?: string;
  endTime?: string;
  sawCompaction?: boolean;
}
```

`ProjectedBlock` is a union:

- `user`
- `assistant`
- `reasoning`
- `tool-call`
- `sub-agent`
- `compaction-boundary`

That union is the contract between the harness projection and the TUI renderer.

## Top-Level App Path

The TUI starts in `apps/tui/src/app.tsx`.

The provider tree is:

```txt
App
  -> ErrorBoundary
  -> AgentHostProvider
  -> NavigationProvider
  -> Router
  -> ChatScreen
```

`AgentHostProvider` in `apps/tui/src/context/AgentHostContext.tsx` creates or receives an `AgentHost`. The host exposes:

- `getState()`
- `subscribe(listener)`
- `dispatch(intent)`
- `getCatalog()`
- `dispose()`

The projected turns are inside `getState()`.

## Subscribing To Host State

`apps/tui/src/hooks/useAgentHostClient.ts` is where React subscribes to host state.

It creates an `AgentHostClient` and uses `useSyncExternalStore`:

```ts
const state = useSyncExternalStore(
  useCallback((cb: () => void) => client.subscribe(cb), [client]),
  useCallback(() => client.getState(), [client]),
);
```

This is the bridge between the host/harness world and React rendering.

When the harness snapshot changes, the host notifies subscribers. `useSyncExternalStore` asks the client for the latest state, and React rerenders the TUI.

## Chat Screen Controller

`apps/tui/src/screens/ChatScreen.tsx` calls:

```ts
const screen = useChatInteractionController();
```

`ChatScreen` itself is mostly layout. It renders:

- header
- active chat mode view
- pending confirmation panel
- pending question panel
- command suggestions
- command palette
- footer

The transcript blocks are rendered inside the active chat mode view.

## Pulling Turns From State

`apps/tui/src/hooks/useChatInteractionController.ts` reads turns from `agent.state`:

```ts
const {
  turns,
  isLoading,
  sessions,
  currentSessionId,
  workspace,
  llm,
  mode,
  pendingConfirmation,
  pendingQuestion,
} = agent.state;
```

Those `turns` came from the harness snapshot. They are already projected.

Then the hook passes them through `useChatRuntimeInteraction(...)`.

## Optimistic User Block

`apps/tui/src/hooks/useChatRuntimeInteraction.ts` can add a temporary user block before the harness projection catches up.

When the user submits input, `sendWithOptimisticMessage` stores the submitted text:

```ts
const sendWithOptimisticMessage = useCallback((content: string) => {
  setOptimisticUserMessage(content);
  send(content);
}, [send]);
```

Then `derivedTurns` is built:

```ts
const derivedTurns = useMemo(() => buildOptimisticTranscript({
  turns,
  optimisticUserMessage,
}), [turns, optimisticUserMessage]);
```

The helper is in `apps/tui/src/hooks/optimisticTranscript.ts`.

If there is an optimistic message and no matching real user block yet, it appends a synthetic turn:

```ts
const optimisticTurn: ProjectedTurn = {
  id: `optimistic_turn_${timestamp.getTime()}`,
  status: "in-progress",
  blocks: [
    {
      type: "user",
      id: `optimistic_${timestamp.getTime()}`,
      content: optimisticUserMessage,
      timestamp: timestamp.toISOString(),
      isFrozen: true,
    },
  ],
  startTime: timestamp.toISOString(),
};
```

Once the real projected user block arrives from the harness, `shouldClearOptimisticMessage(...)` clears the optimistic copy.

So the render input is usually the harness-projected `turns`, but briefly it can be `turns + optimistic user turn`.

## Building The Mode View

`useChatInteractionController()` passes `runtime.derivedTurns` into `buildModeViewContext(...)` in `apps/tui/src/hooks/chatScreenViewModel.ts`.

The transcript part of the mode context looks like this:

```ts
transcript: {
  turns: turns,
  toolsExpanded,
  viewportKey,
}
```

The mode context is then returned to `ChatScreen`.

## Choosing The Active Chat Mode

`ChatScreen` renders the active mode through `renderModeView(...)`:

```ts
switch (modeView.chatMode) {
  case "input":
    return chatModeRegistry.input.render(modeView);
  case "subagent-picker":
    return chatModeRegistry["subagent-picker"].render(modeView);
  case "subagent-detail":
    return chatModeRegistry["subagent-detail"].render(modeView);
}
```

The registry lives in `apps/tui/src/chatModes/registry.tsx`.

For the normal chat transcript, input mode and sub-agent picker mode both use the conversation renderer in `apps/tui/src/chatModes/conversationView.tsx`.

## Conversation View

`apps/tui/src/chatModes/conversationView.tsx` owns the scroll container around the transcript.

The important render path is:

```tsx
<scrollbox ...>
  <box flexDirection="column" width="100%">
    <ChatHistory
      turns={ctx.transcript.turns}
      toolsExpanded={ctx.transcript.toolsExpanded}
    />

    {showSubAgentPicker ? (
      <SubAgentPickerPanel ... />
    ) : null}
  </box>
</scrollbox>
```

So `ConversationView` does not inspect individual blocks. It provides scrolling and passes the turns into `ChatHistory`.

It also:

- uses `stickyScroll` and `stickyStart="bottom"` so new output follows the latest content
- tracks whether the user has scrolled back
- shows a small scroll-to-latest button when the user is away from the bottom
- remounts the scrollbox when `viewportKey` changes after a history reset/session change

## ChatHistory

`apps/tui/src/components/chat/ChatHistory.tsx` is the central block renderer.

It maps turns first:

```tsx
{turns.map((turn) => (
  <box key={turn.id} flexDirection="column">
    {turn.blocks.map((block) => renderBlock(block, toolsExpanded))}
    {turn.status === "failed" && turn.error ? (...failed message...) : null}
  </box>
))}
```

Then `renderBlock(...)` switches on `block.type`.

This is the core block-to-component mapping:

```txt
user                -> UserMessage
assistant           -> AgentMessage
reasoning           -> ReasoningMessage
tool-call           -> ToolMessage
sub-agent           -> SubAgentRow + nested ToolMessage rows
compaction-boundary -> inline bordered compaction notice
```

If a turn failed, `ChatHistory` also appends:

```txt
Turn failed: <error message>
```

under that turn.

## User Blocks

User blocks render through `apps/tui/src/components/chat/UserMessage.tsx`.

`ChatHistory` passes:

```tsx
<UserMessage
  key={block.id}
  content={block.content}
  timestamp={block.timestamp}
/>
```

`UserMessage` renders a row with:

- a branded bullet
- plain text content

It does not currently render the timestamp.

## Assistant Blocks

Assistant blocks render through `apps/tui/src/components/chat/AgentMessage.tsx`.

`ChatHistory` passes:

```tsx
<AgentMessage
  key={block.id}
  content={block.content}
  timestamp={block.timestamp}
/>
```

`AgentMessage` returns `null` if the content is blank:

```ts
if (!content.trim()) return null;
```

Otherwise it renders:

- an assistant-colored bullet
- a `MarkdownRenderer`

Markdown rendering is handled by `apps/tui/src/components/shared/MarkdownRenderer.tsx`.

## Reasoning Blocks

Reasoning blocks render through `apps/tui/src/components/chat/ReasoningMessage.tsx`.

`ChatHistory` passes:

```tsx
<ReasoningMessage
  key={block.id}
  content={block.content}
  timestamp={block.timestamp}
/>
```

`ReasoningMessage` renders:

- a dim, styled `Thinking Process` label
- the content through `MarkdownRenderer`
- dim/italic styling for the reasoning body

## Tool Blocks

Tool-call blocks render through `apps/tui/src/components/chat/ToolMessage.tsx`.

`ChatHistory` passes:

```tsx
<ToolMessage
  key={block.id}
  toolName={block.toolName}
  toolArgs={block.toolArgs}
  status={block.status}
  content={block.content}
  expanded={toolsExpanded}
/>
```

`ToolMessage` first builds a display model using `createToolDisplay(...)` from `@excelsior/core`:

```ts
const display = createToolDisplay({ toolName, toolArgs, status, content });
```

That display model decides labels, command text, activity text, file-change previews, diff stats, and result previews.

The normal collapsed tool render is:

```txt
status indicator + command/activity label
```

If `expanded` is false, most tools show only the header. If the tool has expandable detail, the header also shows:

```txt
(Ctrl+O to expand)
```

When expanded, `ToolMessage` can render:

- writing progress stats
- read-only browse summary
- normalized result text
- completed marker
- file change preview

For completed file actions with a diff preview, it renders `FileChangePreviewView` from `apps/tui/src/components/diff/FileChangePreviewView.tsx`.

## Tool Expansion

The `toolsExpanded` boolean is owned by `useChatRuntimeInteraction.ts`.

It is passed through:

```txt
useChatRuntimeInteraction
  -> buildModeViewContext
  -> ConversationView
  -> ChatHistory
  -> ToolMessage
```

It affects:

- normal `tool-call` blocks
- nested sub-agent tool calls
- sub-agent picker display

The footer/keymap layer uses the tool-call count from `countToolCalls(...)` in `chatScreenViewModel.ts`, so the TUI can expose expansion controls only when there are tools to expand.

## Sub-Agent Blocks

Sub-agent blocks are rendered in `ChatHistory` with:

```tsx
<box key={block.id} flexDirection="column">
  <SubAgentRow
    agent={block.state}
    role={block.role}
    isSelected={false}
  />
  {renderSubAgentTools(block, toolsExpanded)}
</box>
```

The row component lives in `apps/tui/src/components/subAgents/SubAgentRow.tsx`.

`SubAgentRow` renders:

- selection marker, disabled here because the transcript row itself is not selected
- status marker
- cleaned role name
- status and duration
- latest activity line if available

If the sub-agent is running, it updates local `now` once per second so the duration changes while running.

## Nested Sub-Agent Tools

`renderSubAgentTools(...)` in `ChatHistory.tsx` renders tool calls inside a sub-agent block.

It prefers tool-call parts from `block.state.parts`:

```ts
const partTools = block.state.parts.filter(
  (part): part is Extract<SubAgentProjectionPart, { type: "tool-call" }> =>
    part.type === "tool-call",
);
const tools = partTools.length > 0 ? partTools : block.state.toolCalls;
```

If tools are collapsed, it shows only the last two nested tools:

```ts
const visibleTools = expanded ? tools : tools.slice(-2);
```

Each nested tool renders through the same `ToolMessage` component with `nested` enabled:

```tsx
<ToolMessage
  key={tool.toolCallId}
  toolName={tool.toolName}
  toolArgs={tool.toolArgs}
  status={tool.status || "completed"}
  content={tool.content ?? ""}
  nested
  expanded={expanded}
/>
```

If older nested tools are hidden, it renders a muted summary line:

```txt
<n> earlier tool(s)
```

## Compaction Boundary Blocks

Compaction boundary blocks render inline inside `ChatHistory.tsx`.

They do not have a separate component.

The rendered shape is:

- bordered box
- `--- History Compacted ---`
- the compaction summary

These blocks exist because projection can replace old turns with a compacted-history marker.

## Markdown Rendering

Assistant and reasoning messages both use `MarkdownRenderer`.

The relevant path is:

```txt
AgentMessage / ReasoningMessage
  -> MarkdownRenderer
  -> markdown parsing/highlighting helpers
```

The markdown helpers live under:

- `apps/tui/src/components/shared/MarkdownRenderer.tsx`
- `apps/tui/src/lib/markdown/`

Tool messages do not generally use `MarkdownRenderer`; they use structured `ToolDisplay` output and terminal text rows.

## Render Flow Summary

The whole block render path is:

```txt
Harness projection
  -> AgentClientState.turns
  -> AgentHost.getState()
  -> AgentHostClient.getState()
  -> useAgentHostClient()
  -> useChatInteractionController()
  -> useChatRuntimeInteraction()
  -> buildOptimisticTranscript()
  -> buildModeViewContext()
  -> ChatScreen
  -> chatModeRegistry[mode].render(...)
  -> ConversationView
  -> ChatHistory
  -> renderBlock(block)
  -> UserMessage / AgentMessage / ReasoningMessage / ToolMessage / SubAgentRow / compaction UI
```

## Where To Start Reading

For the full render path, read these in order:

1. `apps/tui/src/context/AgentHostContext.tsx`
2. `apps/tui/src/hooks/useAgentHostClient.ts`
3. `apps/tui/src/hooks/useChatInteractionController.ts`
4. `apps/tui/src/hooks/useChatRuntimeInteraction.ts`
5. `apps/tui/src/hooks/optimisticTranscript.ts`
6. `apps/tui/src/hooks/chatScreenViewModel.ts`
7. `apps/tui/src/screens/ChatScreen.tsx`
8. `apps/tui/src/chatModes/conversationView.tsx`
9. `apps/tui/src/components/chat/ChatHistory.tsx`
10. The leaf renderer for the block type you care about.

The leaf renderers are:

- `apps/tui/src/components/chat/UserMessage.tsx`
- `apps/tui/src/components/chat/AgentMessage.tsx`
- `apps/tui/src/components/chat/ReasoningMessage.tsx`
- `apps/tui/src/components/chat/ToolMessage.tsx`
- `apps/tui/src/components/subAgents/SubAgentRow.tsx`

## Tests To Check

The useful TUI tests for this area are:

- `apps/tui/__tests__/chatHistory.test.ts`
- `apps/tui/__tests__/toolMessage.test.ts`
- `apps/tui/__tests__/coreToolDisplay.test.ts`
- `apps/tui/__tests__/coreFileChangePreview.test.ts`
- `apps/tui/__tests__/optimisticTranscript.test.ts`
- `apps/tui/__tests__/scrollToLatest.test.tsx`

Use these when changing how blocks render or how transcript scrolling behaves.
