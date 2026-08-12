# 12 — TUI Build Order (incremental, each step green)

## Goal

Build the v2 TUI (`docs/11-tui-architecture.md`) incrementally in dependency
order — store → routing → engine wiring → windowed transcript → overlays →
views → polish — where every step compiles, passes its tests, and leaves
`npm run check` green. The old `apps/tui` is deleted before step 1; nothing is
ported.

## Ground rules

- Delete the current `apps/tui` source at the start (keep only
  `platform/opentui/` adapter concepts, reimplemented fresh; keep the
  `@opentui/react` dependency and the vitest setup pattern).
- The engine may still be in-process during steps 1–3 (spec 09 lands the
  daemon later); the `engine/` layer hides this behind one module.
- Every step ships tests for its pure logic (store, routing, windowing,
  submit pipeline). Renderer tests use the existing `renderTui` harness.
- A step is done when: typecheck passes, its tests pass, the app renders
  without crashing, and the old behavior it replaces is demonstrably gone
  (no dead imports).

## Step 1 — Skeleton: store, focus, theme, app shell

Goal: a static app shell (header / empty transcript / input bar / footer)
rendered from a working UI store and focus model.

- `store/` (createStore, types, selectors, useSlice), `actions/` stubs,
  `routing/keys.ts` + `parseKeyCombo`, `routing/focus.ts` transitions,
  `theme/` tokens.
- `main.tsx`/`app.tsx`: provider tree, screen switch (`chat`/`settings`),
  global `app` + `chat` keymap tables wired to a single keyboard handler
  (`resolve` → action).
- Input bar renders from `ui.input`; typing/backspace/enter stubbed.

**Accept:** typecheck + store/routing unit tests green; app renders;
`ctrl+c` exits; `ctrl+s` switches to a placeholder settings screen.

## Step 2 — Input bar, history, submit pipeline

Goal: a fully working input model and the submit pipeline that routes text to
a command or a send.

- `actions/input.ts` (value, cursor, history up/down), `actions/submit.ts`
  (`submitPipeline`): if input starts with `/` and matches a catalog command →
  `execute-command`, else `send`.
- Command autocomplete (tab through matching catalog commands) as a pure
  `suggestCommand(value, commands)` helper feeding a small inline hint —
  **not** the old palette.
- Busy-ack handling: send while a run is active shows the engine's `busy`
  ack as a status line message.
- `actions/navigation.ts` + `routing/keymaps/chat.ts` complete.

**Accept:** typing/history/submit unit tests green; `/mode`, `/session new`,
`/clear` work against the (in-process) engine; busy-ack shown; tests assert
no palette/suggestions components exist.

## Step 3 — Engine wiring: deltas → slices

Goal: real streaming into the store; the app shows live runs.

- `engine/` layer: `startEngine`, transport (in-process first, stdio later
  per spec 09), `AgentClient` connect + sync, and `foldDeltas`: map each
  `AgentDelta` (spec 01) onto store slices.
- `actions/confirm.ts` + `actions/question.ts` fold interactions into
  `overlay.pending-*`.
- Minimal rendering: committed blocks rendered in order as plain text rows;
  run overlay appended at the tail (no windowing yet).

**Accept:** e2e scripted run (fake engine or real in-process engine) streams
text and tool rows into the UI; confirmation appears as an overlay; approve
continues the run; `npm run check` green.

## Step 4 — Windowed transcript

Goal: the virtualized list from spec 11 — `window.ts`, `measure.ts`,
`blockMap.tsx` — replacing the plain-text rendering of step 3.

- `transcript/measure.ts`: pure height estimation per block kind (user,
  assistant, tool-call, system; collapsed vs `toolsExpanded`).
- `transcript/window.ts`: `computeWindow` + follow-latest logic.
- `transcript/blockMap.tsx`: memoized per-block components; padTop/padBottom
  spacer boxes; `view` slice drives `scrollTop`/`followLatest`.
- Streaming: live block at the tail re-renders alone.

**Accept:** unit tests for `computeWindow` (anchor, overscan, heights,
follow-latest re-arming); render-count test proves a streamed delta renders
only the live block; 5,000-block fixture scrolls smoothly in manual check.

## Step 5 — Overlays: confirm/question, session list

Goal: all three overlay kinds complete with focus-safe keymaps.

- `PendingOverlay` (confirm: y/n/a, diff preview via `@excelsior/client`
  presentation models; question: 1-9/enter/escape).
- `SessionList` overlay: list from `meta` slice; up/down/enter/d/n/escape
  (spec 11 §6).
- Overlay focus table takes over all keys while open; tests prove no key
  leak (`resolve` returns overlay actions only).

**Accept:** full confirm→approve→continue and question→answer journeys
tested; session create/switch/delete from the overlay tested; `npm run check`
green.

## Step 6 — Views: markdown, diff, settings screen

Goal: real content rendering and the settings screen.

- `components/markdown/` (inline + block renderers) and
  `components/diff/FileChangePreviewView` — presentational only, fed by
  client presentation models.
- `SettingsScreen`: fields for API key, model, auto-approve; save →
  `settings-save` command; back → chat.
- `components/chat/` leaf blocks (UserMessage, AgentMessage, ToolMessage)
  finalized.

**Accept:** markdown/diff unit tests; settings save round-trip e2e;
`npm run check` green.

## Step 7 — Polish: focus UX, reconnect, docs

Goal: finish the feel and the failure path.

- Focus UX: escape/blur/refocus transitions; follow-latest manual scroll
  re-arm; tools expand/collapse (`ctrl+o`).
- `EngineCrashed` banner + restart → `client.syncAll()` resume (spec 09).
- Delete any leftover `apps/tui` dead code; update `README.md` keymap table;
  final `npm run check` + `npm test` full pass.

**Accept:** all step acceptances hold on the final tree; crash-kill test
shows committed turns after restart; zero references to old hooks/registry/
view-model modules.

## Definition of Done (TUI)

- `npm run check` passes; TUI runs against the stdio engine (spec 09).
- Streaming renders O(visible) work; scrolling a 5k-block session is smooth.
- All overlays focus-safe; keymaps are data tables with tests.
- No legacy TUI modules exist (`chatModes`, `panels`, `keymapRegistry`,
  `useChatRuntimeInteraction`, `optimisticTranscript`, `ThemeModal`,
  `CommandPalette`, `SubAgentRow`, `TaskList`).
