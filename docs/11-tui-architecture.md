# 11 — TUI Architecture (store-driven, focus-routed, windowed)

## Goal

Define the v2 TUI as a **store-driven, focus-routed, windowed terminal app**:
all UI state lives in one explicit store mutated only by dispatched actions;
key input is resolved against static per-focus keymap tables (no global
registry); the transcript renders a **windowed** slice of blocks with
per-block identity memoization so streaming and scrolling cost O(visible),
never O(transcript). The old TUI is fully rewritten — nothing is ported.

## Motivation

The current TUI (`apps/tui`) has structural problems that cannot be fixed by
refactoring:

- **Snapshot polling:** every engine delta replaces the whole
  `AgentClientState`, re-running the entire hook composition and re-rendering
  `ChatHistory` top-down (`useAgentHostClient.ts:41` + `ChatScreen.tsx`).
- **God hooks:** `useChatRuntimeInteraction.ts` composes 10+ hooks and funnels
  ~30 props through three view-model layers.
- **Global mutable keymap registry:** `keymapRegistry.ts` is a module-level
  stack with hand-tuned priorities; every key event is broadcast to every
  subscriber (`useKeymap.ts:34`).
- **Reactivity hacks:** `themeRenderKey`/`viewportKey` string cache-busters
  (`useChatRuntimeInteraction.ts:248`); theme mutated outside React.
- **Dead abstractions:** `chatModes` registry (1 mode), `panels` registry
  (1 panel), `inputOwnership` manual priority chain.
- **Client-side optimistic transcript:** duplicates engine state in the UI
  (`optimisticTranscript.ts`).

v2 fixes these at the root: slices, focus routing, windowing.

## Scope

- Rewrite `apps/tui` from scratch (new file tree below).
- The TUI is the only client. Renderer stays OpenTUI/React (the
  `platform/opentui/` adapter survives as the seam).
- Consumes `@excelsior/client` (spec 08) over the stdio transport
  (spec 09).
- Cut: palette, command suggestions, theme modal, sub-agent UI, task list,
  compaction boundary, chatModes/panels registries, optimistic transcript,
  viewport/theme render keys, reflection footer, git branch.

**Non-goals:** desktop, themes beyond a fixed token set, windowing fallback
for non-virtualized layouts, engine changes.

## Design

### File tree

```text
apps/tui/src/
  main.tsx            — bootstrap: startEngine → createClient → createUiStore → render
  app.tsx             — provider tree (store + client context) + screen switch
  store/              — hand-rolled observable store (no library)
    store.ts          — createStore(), useSlice(), dispatch()
    types.ts          — UiState shape
    selectors.ts      — pure slice selectors
  actions/            — the only way UI state or commands change
    input.ts          — setInput, moveCursor, historyUp/Down, submit
    submit.ts         — submitPipeline: command vs send → client.command()
    overlay.ts        — open/close pending panels, session list ops
    viewport.ts       — scrollBy, scrollToTop, toggleFollowLatest, toggleTools
    navigation.ts     — go(screen), back, exit
    confirm.ts        — approve/deny/approveAll
    question.ts       — selectAnswer/submit/cancel
    theme.ts          — setTheme(name)
  routing/
    keys.ts           — TuiKey, parseKeyCombo (from today's lib)
    focus.ts          — Focus model: "app" | "input" | "transcript" | "overlay" | "settings"
                          transitions (pure)
    keymaps/          — static tables per (focus × screen)
      app.ts          — ctrl+c exit
      chat.ts         — screen-level: ctrl+s settings, backspace back
      input.ts        — typing, enter submit, escape blur, up/down history
      transcript.ts   — scroll, follow-latest toggle, tools expand, focus input
      overlay.ts      — confirm (y/n/a), question (1-9/enter/escape), session list
      settings.ts     — field nav, save, back
    resolve.ts        — resolve(focus, screen, combo): Action | null
  transcript/
    window.ts         — pure windowing model (see below)
    measure.ts        — per-block height estimation (pure)
    blockMap.tsx      — block → component, memoized by block id
    overlay.ts        — run overlay: active turn rendered as live blocks
  components/         — presentational only, props in / tree out
    ChatScreen.tsx, SettingsScreen.tsx
    Header.tsx, FooterBar.tsx, InputBar.tsx
    PendingOverlay.tsx, SessionList.tsx, EngineCrashed.tsx
    chat/ (UserMessage, AgentMessage, ToolMessage, Transcript.tsx)
    diff/ (FileChangePreviewView)
    markdown/ (MarkdownRenderer, inline/block renderers)
  engine/             — thin wiring: startEngine, connect, sync, reconnect
  platform/           — opentui adapter (keyboard, viewport, clipboard) [kept]
  theme/              — tokens + fixed theme (reactive slice)
  lib/                — pure helpers (time, text, token estimate)
```

### 1. UI store

Hand-rolled observable store. State is one plain object; slices are derived
via selectors; components subscribe per slice with `useSyncExternalStore`.

```ts
// store/types.ts
interface UiState {
  ui: {
    screen: "chat" | "settings";
    input: { value: string; cursor: number; history: string[]; historyIndex: number };
    focus: Focus;                     // routing/focus.ts
  };
  overlay: {
    kind: "none" | "pending-confirm" | "pending-question" | "session-list";
    state: PendingOverlayState;       // per-kind payload
  };
  view: {
    followLatest: boolean;
    scrollTop: number;                // virtual scroll position (px/rows)
    toolsExpanded: boolean;
  };
  theme: { name: string; tokens: ThemeTokens };
  status: {
    busy: boolean;
    mode: AgentMode;
    llm: AgentLlmInfo;
    engine: "connecting" | "connected" | "crashed";
    error: string | null;
  };
}
```

Rules:

- Mutations only through `dispatch(action)` — actions are plain functions
  `(state) => Partial<UiState>` applied by the store; side effects (calling
  `client.command()`) happen in action *wrappers* after the state patch.
- Components never setState; they call actions and read selectors.
- Engine deltas (spec 08 read model) are folded into slices by a small
  `foldDeltas` layer in `engine/` — the store never imports the client
  protocol beyond delta types.
- `useSlice(selector)` returns the selected value and re-renders only when
  that value changes (reference equality on the selected slice).

### 2. Focus-routed keymaps

`focus` is first-class state: `"app" | "input" | "transcript" | "overlay" | "settings"`.
One keyboard handler in `app.tsx` does:

```ts
keyEvent → TuiKey → resolve(focus, screen, combo) → Action
```

Static tables (no registration, no priorities, no order-dependence):

```ts
// routing/keymaps/input.ts
export const CHAT_INPUT_KEYS: KeyTable = {
  enter:    "input.submit",
  escape:   "input.blur",       // focus → transcript
  up:       "input.historyUp",
  down:     "input.historyDown",
  tab:      "input.insertCommand",   // command autocomplete (see note)
  ctrl+c:   "app.exit",              // inherited from app table only when no overlay
};
```

- `resolve(focus, screen, combo)` looks up `table(screen, focus)`; returns
  `null` if unbound. Action strings map to `actions/` handlers via one
  registry — data, not code.
- **Focus transitions** are pure functions:
  `nextFocus(current, event)` — e.g. confirmation arrives → `input →
  overlay`; overlay answered → `overlay → input`; `escape` in transcript →
  `input`; `escape` in input → `transcript` (blur), etc.
- Overlays *own* all keys while focused: when an overlay is open, only
  `OVERLAY_KEYS` + `app.exit` are consulted — no key can leak to the
  transcript or input behind it.

### 3. Windowed transcript

The transcript is a virtual list. Blocks are immutable values (spec 02);
the active turn streams as the run overlay (spec 04). Both feed one
`VirtualList` model:

```ts
// transcript/window.ts (pure)
interface BlockMetrics { blockId: string; height: number }   // estimated rows
interface WindowResult {
  startIndex: number; endIndex: number;      // inclusive block range to render
  padTop: number; padBottom: number;         // px to render above/below
  totalHeight: number;
  anchor: "top" | "bottom";
}

function computeWindow(
  blocks: readonly TranscriptBlock[],
  liveBlocks: readonly LiveBlock[],          // run overlay blocks
  metrics: (id: string) => number,           // measured/estimated heights
  scrollTop: number,
  viewportHeight: number,
  followLatest: boolean,
  overscan = 8,                              // blocks above/below the viewport
): WindowResult;
```

- **Heights:** estimated from content (text rows via `string-width` + wrap,
  tool blocks via fixed chrome + collapsed/expanded result rows); the
  estimator is pure and unit-tested. Exact line-wrapping measurement is
  approximated — overscan covers the error.
- **Follow-latest:** `followLatest = true` pins `scrollTop = totalHeight -
  viewportHeight`; new blocks/streaming deltas advance the window without
  user-visible jump. Manual scroll (up/down/page) sets `followLatest =
  false`; reaching the bottom re-arms it.
- **Per-block memo:** `blockMap.tsx` memoizes each block component by block
  id + status hash; a `run-text-delta` re-renders exactly the live block.
  Committed blocks render once, ever.
- **Streaming:** live blocks live at the tail (index ≥ blocks.length). The
  window includes them only when in range — a fast-following viewport with
  the input bar visible always shows the streaming tail.
- **No hacks:** `viewportKey`/`themeRenderKey` are gone — `scrollTop`,
  `followLatest`, and `theme` are store state.

### 4. Components are presentational

- No hooks that read state *and* dispatch side effects. A component may use
  `useSlice` (read) or call action wrappers from event handlers.
- `ChatScreen` is the only screen composition; overlays are rendered above
  the transcript via the store's `overlay` slice.
- Markdown and diff views are pure presentational trees fed by
  `@excelsior/client` presentation models (spec 08).

### 5. Engine wiring

`engine/` owns: `startEngine(workspaceRoot)` (spec 09 spawn), transport,
`AgentClient` connection, initial sync, delta folding into store slices, and
reconnect: on `engine: crashed` the user gets a restart prompt; restart +
`client.syncAll()` restores committed state (cursors make it lossless).

### 6. Session list overlay

`/session` (or a key) opens `overlay: session-list`:

- Up/Down select, Enter switches (`session-switch`), `d` deletes
  (`session-delete`), `n` creates new (`session-create`), Escape closes.
- The list comes from the `meta` slice (spec 08), rendered over the
  transcript; focus rules ensure no key leaks.

## Cut (confirmed structural deletions)

| Today | Gone because |
|---|---|
| CommandPalette, CommandSuggestions | cut feature |
| ThemeModal + /theme picker | fixed theme; `/theme` command dropped |
| SubAgentRow + sub-agent blocks | subagents cut (spec 00) |
| TaskList + tasks blocks | tasks tool cut |
| compaction-boundary block | compaction cut |
| chatModes/ registry + panels registry + inputOwnership chain | replaced by focus routing |
| optimisticTranscript + viewportKey/themeRenderKey | store + deltas make them unnecessary |
| git branch header, reflection footer, token estimate footer | cut or replaced by status slice |
| `useChatRuntimeInteraction`/`useChatInteractionController`/view-model builders | store + actions |

## Steps (see `docs/12-tui-build.md` for order and acceptance)

1. `store/` + `routing/` + `platform/` skeleton; static app shell renders.
2. Input bar + submit pipeline; commands via `client.command()`.
3. Engine wiring + delta folding; real send/stream as plain text.
4. `transcript/window.ts` + `blockMap.tsx`; windowed rendering.
5. Overlays: pending confirm/question, session list.
6. Markdown + diff views; settings screen.
7. Focus UX polish, follow-latest behavior, crash-reconnect banner; `npm run check` green.

## Acceptance Criteria

- Streaming a long turn re-renders only the active live block (assert via
  render-count instrumentation in tests); committed blocks render once.
- Scrolling a 5,000-block session scrolls and renders O(viewport) rows per
  frame — no per-block work on the whole transcript.
- Focus routing: with an overlay open, no key reaches the input or
  transcript; keymap tables are pure data with unit tests
  (`resolve(focus, screen, combo)`).
- No `AgentClientState` polling, no `viewportKey`, no `themeRenderKey`, no
  optimistic-transcript module — grep proves absence.
- Full user journey in e2e: send → stream → tool → confirm → respond →
  commit → restart engine → resume.
