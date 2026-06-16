# TUI Keybindings Flow

This document walks through how keyboard input works in the TUI, from OpenTUI key events to chat actions, modal actions, text editing, and global navigation.

## Big Picture

The TUI has two related input paths:

- keymap actions: shortcuts such as `Ctrl+C`, `Shift+Tab`, `Ctrl+O`, `Esc`, `y`, `n`, `up`, and `down`
- text input handling: typing characters into `ChatInput`, settings fields, or the command palette search box

Both paths start from OpenTUI keyboard events, but they are handled differently:

```txt
OpenTUI key event
  -> useKeyboardInput(...)
  -> keyEventToTuiKey(...)
  -> either:
       useKeymap(...) action resolution
       direct text-input editing logic
```

The shared normalized key shape is `TuiKey` in `apps/tui/src/lib/tuiKey.ts`.

## OpenTUI Keyboard Adapter

The lowest-level wrapper is `apps/tui/src/platform/opentui/useKeyboardInput.ts`.

It wraps OpenTUI's `useKeyboard`:

```ts
useKeyboard((key) => {
  if (!isActive) return;
  if (key.eventType === "release") return;
  const mapped = keyEventToTuiKey(key);
  handlerRef.current(mapped.input, mapped.key);
});
```

Important details:

- it ignores key release events
- it supports an `isActive` option
- it stores the handler in a ref so the keyboard subscription can call the latest callback
- it converts OpenTUI's raw key event into `{ input, key }`

## Normalized Key Shape

`apps/tui/src/platform/opentui/keyAdapter.ts` converts OpenTUI's `KeyEvent` into the local `TuiKey`.

`TuiKey` is defined in `apps/tui/src/lib/tuiKey.ts`:

```ts
export interface TuiKey {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  return?: boolean;
  escape?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  pageUp?: boolean;
  pageDown?: boolean;
}
```

The adapter also computes `input`.

Examples:

- pressing `a` gives `input = "a"`
- pressing space gives `input = " "`
- pressing `Ctrl+C` gives `input = "c"` and `key.ctrl = true`
- pressing `up` gives `input = ""` and `key.upArrow = true`

That split is important because text input cares about typed characters, while shortcut handling cares about the normalized key flags.

## Combo Strings

Keymap actions use string combos.

`apps/tui/src/lib/parseKeyCombo.ts` converts `{ input, key }` into a combo string:

```ts
parseKeyCombo("o", { ctrl: true })       // "ctrl+o"
parseKeyCombo("", { escape: true })      // "escape"
parseKeyCombo("", { shift: true, tab: true }) // "shift+tab"
parseKeyCombo("a", {})                   // "a"
```

The parser adds modifiers first:

1. `ctrl`
2. `meta`
3. `shift`, except for normal uppercase/lone letter input

Then it adds the key name:

- `up`
- `down`
- `left`
- `right`
- `return`
- `escape`
- `tab`
- `backspace`
- `delete`
- `pageup`
- `pagedown`
- or the lowercase `input`

These combo strings are the keys in a `KeyMap`.

## Keymap Registry

The registry lives in `apps/tui/src/lib/keymapRegistry.ts`.

The core types are:

```ts
export type KeyAction = () => void;
export type KeyMap = Partial<Record<string, KeyAction>>;

export interface KeymapEntry {
  priority: number;
  enabled: boolean;
  getMap: () => KeyMap;
}
```

Every mounted `useKeymap(...)` registers a `KeymapEntry` in a module-level stack.

When a key is pressed, the registry:

1. sorts entries by descending priority
2. skips disabled entries
3. checks whether the entry has an action for the combo
4. returns the first match

So priority controls ownership when multiple components know about the same key.

## useKeymap

`apps/tui/src/hooks/useKeymap.ts` is the React hook around the registry.

It does two jobs:

1. Register the component's keymap entry.
2. Listen to keyboard input and run the action only if this entry wins.

The important part is:

```ts
useKeyboardInput((input, key) => {
  const combo = parseKeyCombo(input, key);
  const winner = getAction(combo);
  if (winner && winner.entry === entryRef.current) {
    winner.action();
  }
});
```

Because every `useKeymap` call listens to keyboard input, the `winner.entry === entryRef.current` check prevents every matching component from running. Only the highest-priority enabled entry for that combo executes.

## Global Navigation Keymaps

Global navigation is registered in `apps/tui/src/components/navigation/Router.tsx`.

There are two global keymaps:

```ts
useKeymap(
  {
    "ctrl+c": () => runNavigationAction("exit"),
  },
  { priority: GLOBAL_EXIT_KEYMAP_PRIORITY },
);
```

and:

```ts
useKeymap(
  {
    "ctrl+s": () => runNavigationAction(...),
    backspace: () => runNavigationAction(...),
  },
  { priority: GLOBAL_NAVIGATION_KEYMAP_PRIORITY },
);
```

The priorities are defined in `apps/tui/src/lib/navigation/globalActions.ts`:

```ts
export const GLOBAL_EXIT_KEYMAP_PRIORITY = 200;
export const GLOBAL_NAVIGATION_KEYMAP_PRIORITY = 1;
```

Current global actions:

- `Ctrl+C`: exit the TUI
- `Ctrl+S`: open settings from chat
- `Backspace`: go back on screens other than settings/chat

`Ctrl+C` has very high priority so it can beat most local keymaps.

## Chat Keymap Orchestrator

Chat-specific keymaps are installed by `apps/tui/src/hooks/useChatKeymaps.ts`.

`useChatRuntimeInteraction.ts` calls it with the current mode context and action handlers:

```ts
useChatKeymaps({
  ...interactionState.chatModeKeymap,
  pending: interactionState.pending,
  confirmationPending: confirmation.pending,
  questionPending: question.pending,
  approve: confirmation.approve,
  approveAll: confirmation.approveAll,
  deny: confirmation.deny,
  cancel,
  requestTurnCancel,
  ...
});
```

`useChatKeymaps` installs three categories:

1. pending confirmation keymap
2. pending question keymap
3. active chat-mode keymaps

## Pending Confirmation Keymap

When a confirmation is pending, `useChatKeymaps` registers this map at priority `100`:

```ts
{
  y: approve,
  a: approveAll,
  n: deny,
  escape: () => {
    deny();
    cancel();
  },
  up: () => scrollUp?.(),
  down: () => scrollDown?.(),
  tab: () => nextHunk?.(),
  "shift+tab": () => prevHunk?.(),
}
```

It is enabled only when:

```ts
!!hasConfirmationPending && modalKeymapsEnabled
```

`modalKeymapsEnabled` is false while the command palette is open.

So when a confirmation is visible:

- `y`: approve current confirmation
- `a`: approve all confirmations
- `n`: deny
- `Esc`: deny and cancel
- `Up` / `Down`: scroll the diff preview
- `Tab` / `Shift+Tab`: move between hunks

Because this keymap has priority `100`, it beats normal chat mode keymaps.

## Pending Question Keymap

When an ask-question prompt is pending, `useChatKeymaps` registers:

```ts
{
  escape: () => {
    cancelQuestion?.();
  },
}
```

It also uses priority `100`.

The actual answer typing is handled by the pending question panel's input component. This keymap only handles prompt-level cancellation.

## Chat Modes

The chat modes are defined in `apps/tui/src/chatModes/types.ts`:

```ts
export const chatModeIds = [
  "input",
  "subagent-picker",
  "subagent-detail",
] as const;
```

The registry is in `apps/tui/src/chatModes/registry.tsx`.

Each mode implements:

```ts
export interface ChatModeDefinition<TMode extends ChatMode> {
  render(ctx: ChatModeRenderContextMap[TMode]): ReactNode;
  getHint(ctx: ChatModeHintContext): string;
  getKeymaps(ctx: ChatModeKeymapContextMap[TMode]): ChatModeKeymapSpec[];
}
```

So a chat mode owns:

- how it renders
- what hint text appears in the footer
- which keymaps are active while that mode is selected

`useChatKeymaps` calls:

```ts
getChatModeKeymaps(chatModeOptions)
```

and registers the returned maps.

## Input Mode Keymap

Input mode is defined in `apps/tui/src/chatModes/inputMode.ts`.

Its keymap has priority `10` and is enabled only when `ownsChatInput(ctx)` is true.

`ownsChatInput` comes from `apps/tui/src/lib/inputOwnership.ts`.

Input mode shortcuts:

- `Esc`: if loading, cancel the current turn
- `Shift+Tab`: toggle Plan/Act mode
- `Ctrl+M`: toggle Plan/Act mode
- `Ctrl+O`: expand/collapse tool details
- `Up`: previous command suggestion, or previous input history entry
- `Down`: next command suggestion, or next input history entry
- `Tab`: complete selected command suggestion
- `Enter`: submit selected command suggestion when suggestions are visible

One subtle detail: in input mode, `useChatKeymaps` replaces `cancel` with `requestTurnCancel` when available:

```ts
const chatModeOptions = options.chatMode === "input"
  ? { ...options, cancel: requestTurnCancel ?? cancel }
  : options;
```

That is why `Esc` follows the double-escape cancel behavior while the agent is loading.

## Sub-Agent Picker Mode Keymap

Sub-agent picker mode is defined in `apps/tui/src/chatModes/subAgentPickerMode.ts`.

Its keymap has priority `80`.

Shortcuts:

- `Up`: previous sub-agent
- `Down`: next sub-agent
- `Enter`: open selected sub-agent detail
- `Ctrl+O`: expand/collapse tool calls
- `Esc`: close picker and return to input mode

It is disabled while the command palette is open.

## Sub-Agent Detail Mode Keymap

Sub-agent detail mode is defined in `apps/tui/src/chatModes/subAgentDetailMode.tsx`.

Its keymap has priority `80`.

Shortcuts:

- `Esc`: return to sub-agent picker
- `Ctrl+O`: expand/collapse tool calls

It is also disabled while the command palette is open.

## Input Ownership

`apps/tui/src/lib/inputOwnership.ts` decides which part of the chat screen should own normal chat-mode keymaps.

The owner priority is:

```txt
command-palette
pending-prompt
feature-panel
chat-input
chat-mode
```

The function is:

```ts
export function getTuiInputOwner(state: TuiInputOwnershipState): TuiInputOwner {
  if (state.isPaletteOpen) return "command-palette";
  if (state.pending) return "pending-prompt";
  if (state.activePanelId) return "feature-panel";
  if (state.chatMode === "input") return "chat-input";
  return "chat-mode";
}
```

Input mode uses `ownsChatInput(ctx)`.

Modal modes use `ownsModalInput(isPaletteOpen)`, which currently means "enabled unless the command palette is open."

This prevents normal chat shortcuts from firing while a prompt, panel, or palette should own the input.

## Text Input Handling

`ChatInput` uses `SafeTextInput`, and `SafeTextInput` handles typed characters directly.

The relevant file is `apps/tui/src/components/chat/SafeTextInput.tsx`.

It has its own `useKeyboardInput(...)` call:

```ts
useKeyboardInput((input, key) => {
  if (isClipboardShortcut(input, key, { selectAll: true })) {
    return;
  }

  if (shouldIgnoreTextInputKey(input, key)) return;

  if (key.return) {
    if (shouldSubmit && !shouldSubmit(originalValue)) return;
    onSubmit?.(originalValue);
    return;
  }

  const next = applyTextInputKey(...);
  ...
}, { isActive: focus });
```

This path is not a `KeyMap` because text editing needs character-by-character behavior.

`SafeTextInput` also registers clipboard/select-all shortcuts through `useKeymap` at priority `150` while focused:

- `Ctrl+C` / `Meta+C`: copy selection or full input value
- `Ctrl+V` / `Meta+V`: paste
- `Ctrl+A` / `Meta+A`: select all

Text editing helpers live in `apps/tui/src/lib/input/textInput.ts`.

That file handles:

- copy/paste shortcut detection
- single-line paste sanitization
- selection ranges
- cursor movement
- backspace/delete
- text insertion

## Command Palette Input

The command palette is in `apps/tui/src/components/palette/CommandPalette.tsx`.

It has two input mechanisms:

1. `useKeymap` for clipboard shortcuts at priority `150`
2. direct `useKeyboardInput` for search editing and palette navigation

Direct palette keys:

- `Esc`: close palette
- `Enter`: insert selected command
- `Up`: previous command
- `Down`: next command
- `Backspace` / `Delete`: remove last search character
- `Tab`: copy selected command name into search
- typed characters: append to search

Because the palette is treated as the input owner, normal chat-mode keymaps are disabled while it is open.

## Session Picker Panel Keymap

`apps/tui/src/components/sessions/SessionPickerPanel.tsx` is an example of a feature panel that registers its own keymap.

It uses priority `70`.

Shortcuts:

- `Up`: previous session
- `Down`: next session
- `Esc`: close panel
- `Ctrl+D`: arm/delete selected session
- `Enter`: switch to selected session and close panel

Since feature panels become the input owner, normal input mode keymaps are disabled while a feature panel is active.

## Settings Screen Input

`apps/tui/src/screens/SettingsScreen.tsx` uses direct `useKeyboardInput`.

It handles:

- `Tab`: switch focused settings field
- `Esc`: close settings/go back

Each settings field is a `ChatInput`, so the actual text editing comes from `SafeTextInput`.

## Hints

Footer hint text is separate from keymap registration.

Hints are generated in `apps/tui/src/chatModes/hints.ts`.

For example:

- pending confirmation shows `y accept | a accept all | n deny | ...`
- loading input mode shows `Esc twice cancel`
- tool output shows `Ctrl+O expand/collapse tools`
- normal input mode shows `Shift+Tab switch mode`

The hint text should match the keymaps, but it does not drive behavior.

## Priority Summary

Current important priorities:

```txt
200  global Ctrl+C exit
150  focused text input clipboard/select-all
150  command palette clipboard
100  pending confirmation/question
80   sub-agent picker/detail modes
70   session picker feature panel
10   normal chat input mode
1    global navigation Ctrl+S/backspace
```

Higher priority wins for the same combo.

Example: `Ctrl+C`

- Router registers global exit at `200`
- SafeTextInput registers copy at `150`
- `200` wins, so `Ctrl+C` exits rather than copying from chat input

Example: `Esc` while a confirmation is pending

- pending confirmation keymap registers `Esc` at `100`
- input mode registers `Esc` at `10`
- `100` wins, so `Esc` denies/cancels the confirmation rather than doing normal input-mode cancel

## End-To-End Example

Pressing `Ctrl+O` in normal input mode:

```txt
OpenTUI emits KeyEvent(name: "o", ctrl: true)
  -> useKeyboardInput
  -> keyEventToTuiKey
       input = "o"
       key.ctrl = true
  -> useKeymap listener
  -> parseKeyCombo("o", { ctrl: true })
       "ctrl+o"
  -> keymapRegistry.getAction("ctrl+o")
  -> input mode keymap wins at priority 10
  -> ctx.toggleToolsExpanded()
  -> toolsExpanded state changes
  -> ChatHistory rerenders tool blocks expanded/collapsed
```

Pressing `Tab` while command suggestions are visible:

```txt
OpenTUI emits tab key
  -> parseKeyCombo(...)
       "tab"
  -> input mode keymap
  -> completeCommandInput(...)
  -> ctx.setInput(completed command text)
```

Typing `h` into the chat input:

```txt
OpenTUI emits KeyEvent(name: "h")
  -> useKeyboardInput in SafeTextInput
  -> keyEventToTuiKey
       input = "h"
  -> shouldIgnoreTextInputKey(...) returns false
  -> applyTextInputKey(...)
  -> onChange(nextValue)
```

That typed character does not need a `KeyMap` entry.

## Where To Start Reading

Read these files in this order:

1. `apps/tui/src/platform/opentui/useKeyboardInput.ts`
2. `apps/tui/src/platform/opentui/keyAdapter.ts`
3. `apps/tui/src/lib/tuiKey.ts`
4. `apps/tui/src/lib/parseKeyCombo.ts`
5. `apps/tui/src/lib/keymapRegistry.ts`
6. `apps/tui/src/hooks/useKeymap.ts`
7. `apps/tui/src/components/navigation/Router.tsx`
8. `apps/tui/src/hooks/useChatKeymaps.ts`
9. `apps/tui/src/chatModes/registry.tsx`
10. `apps/tui/src/chatModes/inputMode.ts`
11. `apps/tui/src/chatModes/subAgentPickerMode.ts`
12. `apps/tui/src/chatModes/subAgentDetailMode.tsx`
13. `apps/tui/src/components/chat/SafeTextInput.tsx`
14. `apps/tui/src/components/palette/CommandPalette.tsx`
15. `apps/tui/src/lib/inputOwnership.ts`

## Tests To Check

Useful tests for this area:

- `apps/tui/__tests__/keymap.test.ts`
- `apps/tui/__tests__/modeHints.test.ts`
- `apps/tui/__tests__/commandPalette.test.ts`
- `apps/tui/__tests__/clipboardShortcuts.test.ts`
- `apps/tui/__tests__/safeTextInput.test.ts`
- `apps/tui/__tests__/sessionPicker.test.ts`
- `apps/tui/__tests__/navigation.test.ts`

Use these when changing shortcut behavior, keymap priority, input ownership, or text editing.
