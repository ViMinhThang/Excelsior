# Excelsior TUI

Terminal client for the Excelsior engine daemon (`@excelsior/engine`), built on
OpenTUI. The client renders a UI store that is folded from engine deltas and
routes keys through static per-focus tables; it never imports engine internals.

## Run

```bash
npm install          # installs bun (dev script runtime) and workspace deps
npm run dev:tui      # start the TUI against the engine daemon (bun required)
npm run dev:tui:node # same, but only works on Node 26.1+ (node:ffi)
```

`dev:tui` uses Bun because OpenTUI's native FFI needs `bun:ffi` (or Node 26.1+
with `node:ffi`). The engine daemon is spawned as a child process speaking the
stdio transport from `@excelsior/protocol`; committed turns survive client and
engine restarts.

## Keymap

| Keys | Focus | Action |
| --- | --- | --- |
| `ctrl+c` | any | quit |
| `ctrl+s` | chat | open settings |
| `enter` | input | submit (command if starts with `/`, else send) |
| `tab` | input | complete slash command |
| `escape` | input | blur to transcript |
| `up` / `down` | input | history |
| `ctrl+a` / `ctrl+e` | input | line start / end |
| `ctrl+u` / `ctrl+k` | input | clear before / after cursor |
| `ctrl+w` | input | delete word |
| `↑` / `↓`, `pageup` / `pagedown` | transcript | scroll |
| `home` / `end` | transcript | scroll to top / bottom |
| `ctrl+f` | transcript | toggle follow latest |
| `ctrl+o` | transcript | toggle tool results |
| `escape` | transcript | focus input |
| `y` / `n` / `a` | confirm overlay | approve / deny / approve all |
| `1`-`9`, `↑`/`↓`, `enter`, `esc` | question overlay | select / submit / cancel |
| `↑`/`↓`, `enter`, `d`, `n`, `esc` | session list | move / switch / delete / new |
| `↑` / `↓`, `enter`, `tab`, `ctrl+s`, `esc` | settings | navigate / toggle / next field / save / back |

## Test

```bash
npm test -- --project tui   # unit tests for store, routing, transcript windowing, actions
```

The `vitest.setup.ts` mocks `@opentui/core` and `@opentui/react` so components
render under `react-test-renderer` without a terminal.