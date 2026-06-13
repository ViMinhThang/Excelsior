# TUI Write/Edit Tool Display Flow

This document explains how the TUI displays `write` and `edit` tool calls, including pending confirmation previews and completed file-change results.

## Big Picture

Write/edit display is split across two modules:

- `@excelsior/core` decides the display model: command text, summary, diff stats, and parsed file-change preview.
- `apps/tui` renders that model as terminal UI: headers, progress stats, inline diffs, scrollbars, and expansion hints.

The important behaviors are:

- `write`, `writeFile`, `edit`, and `editFile` share one file-change display policy.
- Pending write/edit confirmations can show a diff before execution when `ConfirmRequest.diff` is present.
- Completed write/edit tool results can show a parsed diff after execution.
- Write previews hide removed rows, so creates and overwrites focus on the resulting file content.
- Edit previews show both removed and added rows.
- Long completed previews are capped while collapsed and expanded with `Ctrl+O`.
- Pending confirmation previews scroll with `Up` / `Down` and jump hunks with `Tab`.

The completed tool-call path is:

```text
Tool result event reaches projection
  -> ProjectedBlock type "tool-call"
  -> ChatHistory renders ToolMessage
  -> ToolMessage calls createToolDisplay(...)
  -> fileToolDisplays parses completed diff into FileChangePreview
  -> createToolDisplayPresentation(...) marks it expandable
  -> ToolMessage renders FileChangeToolHeader + FileChangePreviewView
  -> FileChangePreviewView builds a terminal-sized frame
```

The pending confirmation path is:

```text
write/edit asks for confirmation with filePath + diff
  -> useToolConfirmation receives pending ConfirmRequest
  -> createToolDisplay(... status "pending", filePath, diff)
  -> parsePendingFileChangePreview builds FileChangePreview
  -> PendingActionPanel renders FileChangePreviewView
```

## Main Files

Core display policy:

- `packages/core/src/conversationPresentation/createToolDisplay.ts`
- `packages/core/src/conversationPresentation/fileToolDisplays.ts`
- `packages/core/src/conversationPresentation/fileChangePreviewParser.ts`
- `packages/core/src/conversationPresentation/fileChangePreviewFrame.ts`
- `packages/core/src/conversationPresentation/toolDisplayPresentation.ts`
- `packages/core/src/conversationPresentation/toolDisplayRegistry.ts`
- `packages/core/src/conversationPresentation/types.ts`

TUI rendering:

- `apps/tui/src/components/chat/ToolMessage.tsx`
- `apps/tui/src/components/diff/FileChangePreviewView.tsx`
- `apps/tui/src/components/chat/PendingActionPanel.tsx`
- `apps/tui/src/hooks/useToolConfirmation.ts`
- `apps/tui/src/components/chat/ChatHistory.tsx`

Tests:

- `apps/tui/__tests__/coreToolDisplay.test.ts`
- `apps/tui/__tests__/coreFileChangePreview.test.ts`
- `apps/tui/__tests__/toolMessage.test.ts`
- `apps/tui/__tests__/questionResponse.test.ts`

## Tool Names

The display registry maps these tool names to file-change display configs:

```text
write     -> writeDisplayConfig
writeFile -> writeFileDisplayConfig
edit      -> editDisplayConfig
editFile  -> editFileDisplayConfig
```

The config lives in `fileToolDisplays.ts`.

Both write configs render with label `Write`. Both edit configs render with label `Edit`.

The only command-formatting difference is that `writeFile` and `editFile` can receive a resolved `filePath` separately from raw JSON args. That lets confirmation previews display the target path even when the pending diff comes from the confirmation request instead of a completed tool result.

## Completed Result Shape

The harness file tools return a success line followed by a unified diff when a write/edit changes content.

Write example:

```text
Successfully wrote 25 characters to created.ts
--- created.ts
+++ created.ts
@@ -1,0 +1,2 @@
+export const name = "new";
+export const ready = true;
```

Edit example:

```text
Successfully replaced the block in demo.ts.
--- demo.ts
+++ demo.ts
@@ -1,1 +1,1 @@
-old
+new
```

`formatFileChangeTool()` treats the first line as the success line and the rest as diff content.

If diff content exists, the detail becomes:

```text
<filePath> (+<added> -<removed> lines)
```

If no diff content exists, the detail falls back to the success line.

## Core Display Model

`ToolMessage` does not inspect write/edit output directly. It asks core for a display model:

```ts
const display = createToolDisplay({ toolName, toolArgs, status, content });
const presentation = createToolDisplayPresentation({ display, status, content });
```

`createToolDisplay()`:

- parses `toolArgs`
- normalizes tool result text
- creates command text like `write(path)` or `edit(path)`
- applies file-action policy for pending state
- delegates write/edit formatting to the registry config
- attaches `fileChangePreview` when a pending or completed diff can be parsed

`createToolDisplayPresentation()`:

- sets `hasFileChangePreview` for completed file actions with a preview
- formats compact diff stats as `+<added> -<removed>`
- chooses a generic body for non-preview tools
- marks the tool expandable when it has activity, body content, or a file-change preview

For completed file-change previews, the normal body still contains detail text, but `ToolMessage` takes the file-change branch first and renders the diff instead of the success sentence.

## Parsing Diffs

Completed diffs are parsed by:

```text
parseFileChangePreview({ toolName, filePath, content })
```

Pending confirmation diffs are parsed by:

```text
parsePendingFileChangePreview({ toolName, filePath, diff })
```

`parsePendingFileChangePreview()` first normalizes tool names:

- `edit` and `editFile` become `edit`
- `write` and `writeFile` become `write`
- any other tool returns no preview

Then it wraps the pending diff with a synthetic first line and calls `parseFileChangePreview()`.

`parseFileChangePreview()` looks for the first `--- ` line and then parses unified diff hunks:

- `@@ -old,+new @@` updates old/new line counters
- space-prefixed rows become context rows on both sides
- `-` rows become removed rows
- `+` rows become added rows
- adjacent remove/add groups are flushed into aligned old/new rows
- missing old/new rows become empty placeholder rows

The parser returns `undefined` when it cannot find a hunk or when there are no added/removed rows.

The resulting `FileChangePreview` contains:

```ts
interface FileChangePreview {
  filePath: string;
  action: "edit" | "create" | "overwrite";
  oldRows: FileChangeRow[];
  newRows: FileChangeRow[];
  oldLines: string[];
  newLines: string[];
  added: number;
  removed: number;
  omittedRows: number;
  hunkIndices?: number[];
}
```

For `edit`, the action is always `edit`. For `write`, the action is:

- `create` when there are no removed rows
- `overwrite` when there are removed rows

## Completed TUI Rendering

`ChatHistory` renders projected tool blocks with:

```tsx
<ToolMessage
  toolName={block.toolName}
  toolArgs={block.toolArgs}
  status={block.status}
  content={block.content}
  expanded={toolsExpanded}
/>
```

When `ToolMessage` sees `presentation.hasFileChangePreview`, it renders:

```text
FileChangeToolHeader
FileChangePreviewView
```

The header contains:

- a diamond glyph for top-level tools, or branch glyph for nested sub-agent tools
- `Write` or `Edit`
- the highlighted file path
- compact diff stats while collapsed
- `(Ctrl+O to expand)` when expandable and collapsed

The completed tool display does not show the success sentence when a diff preview exists. The diff preview is the result display.

## Pending Confirmation Rendering

Pending write/edit previews are rendered through a different TUI branch.

`useToolConfirmation()` receives the pending `ConfirmRequest` and builds a display:

```ts
createToolDisplay({
  toolName: pending.toolName,
  toolArgs: pending.args,
  status: "pending",
  filePath: pending.filePath,
  diff: pending.diff,
})
```

The pending `ToolDisplay` goes to `PendingActionPanel`.

`PendingActionPanel` shows:

- action title
- display label and summary
- detail text, usually `waiting for approval or execution`
- accept/deny key hints
- `FileChangePreviewView` when `display.fileChangePreview` exists

Pending previews pass `pending` to `FileChangePreviewView`, which enables fixed-height scrolling and scrollbar rendering.

## Frame Building

`FileChangePreviewView` calls:

```ts
buildFileChangePreviewFrame({
  preview,
  terminalColumns: width || 180,
  scrollOffset,
  pending,
  focused,
  hideRemovedRows,
})
```

`hideRemovedRows` is true for non-edit actions:

```ts
const hideRemovedRows = preview.action !== "edit";
```

That means:

- edit previews show removed and added rows
- create previews show added rows
- overwrite previews hide removed rows and show the resulting added rows

The frame converts the parser's old/new parallel rows into inline terminal rows:

```text
context row
- removed row
+ added row
```

Adjacent removed and added rows are grouped so related changes stay together.

Frame height rules:

- pending previews use `PENDING_VIEWPORT_HEIGHT` of 12 rows
- focused completed previews show all inline rows
- collapsed completed previews cap at 10 rows

Collapsed completed previews with more than 10 inline rows show an expand hint.

## Diff Row Rendering

`FileChangePreviewView` renders each frame row with `DiffLineRow`.

Each row has:

- a line-number gutter padded to four characters
- syntax-highlighted text from `highlightCodeLine(...)`
- colors based on diff tone

Tone colors:

- `removed`: removed background and removed text color
- `added`: added background and added text color
- `context`: context text color and dimmed attributes

Language is inferred from the file extension:

```text
.ts  -> ts
.tsx -> tsx
.js  -> js
.jsx -> jsx
.json, .css, .html, .md, .py, ...
```

Unknown extensions render with fallback coloring.

## Expansion And Scrolling

Completed tool expansion is global for the conversation view. The `toolsExpanded` flag flows through:

```text
useChatRuntimeInteraction
  -> buildModeViewContext
  -> ConversationView
  -> ChatHistory
  -> ToolMessage
```

When expanded:

- completed edit previews show all removed/added/context rows
- completed write previews show all visible resulting rows
- the compact diff stats move out of the header
- capped preview hints disappear

Pending confirmation preview navigation is separate. `useToolConfirmation()` owns:

- `scrollOffset`
- `activeHunkIndex`
- `hunkCount`

It uses `getFileChangePreviewNavigation(preview)` to calculate:

- total rows
- hunk indices
- hunk count
- max scroll

The keymap layer maps:

- `Up` / `Down` to scroll
- `Tab` / previous-hunk action to hunk navigation
- `y`, `a`, and `n` to approve, approve all, and deny

## Fallback Behavior

If a completed write/edit result has diff lines but the parser cannot build a `FileChangePreview`, `formatFileChangeTool()` falls back to a text preview:

- first 10 diff lines become `resultPreview`
- remaining diff lines are counted in `omittedResultLines`

If no diff lines exist, the display detail is the success line.

If a pending confirmation has no `diff`, no file-change preview is shown; the panel still shows the action details and response keys.

## Important Boundaries

The TUI renderer does not parse harness diffs. Parsing and display policy live in `@excelsior/core`, which gives both pending confirmation UI and completed transcript UI the same `FileChangePreview` shape.

The TUI owns terminal-specific layout: line gutters, colors, syntax highlighting, capping, scrollbars, and expansion hints.
