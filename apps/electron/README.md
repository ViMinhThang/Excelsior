# Excelsior Desktop (Electron)

Frameless Electron shell that **reuses the web frontend** (`apps/web`) verbatim. No duplicated UI code — the desktop loads the same Next.js static export that the browser does, over the same `ws://localhost:17812/v1/ws` `pkg/protocol` hub as the TUI.

```
apps/web/app/page.tsx        ─┐
apps/web/components/*         ├─► Next.js static export (apps/web/dist/)
apps/web/lib/protocol.ts     ─┘         │
                                        ▼
                               apps/electron/renderer/  (copy of dist)
                                        │
                               apps/electron/main.js ─► BrowserWindow (file://)
                               apps/electron/preload.js ─► window.electronAPI
```

## How it reuses the web frontend

- **Single source of truth:** `apps/web` owns all UI: `page.tsx`, `Sidebar`, `Composer`, `MarkdownRenderer`, `MenuBar`, `SettingsModal`, etc., plus `lib/protocol.ts` mirroring `pkg/protocol`.
- **Export for Electron:** `apps/web/next.config.js` uses `output: "export"` + `assetPrefix: "./"` so `npm run build` produces pure HTML/CSS/JS in `apps/web/dist` that works on `file://` (no server needed). This same `dist` is what the browser serves and what Electron loads.
- **Bridge:** `apps/electron/preload.js` exposes `window.electronAPI` (contextIsolation + sandbox). `apps/web/app/page.tsx` already detects it:
  ```ts
  const api = (window as any).electronAPI;
  if (api?.getEngineUrl) setEngineUrl(await api.getEngineUrl());
  if (api?.openFolderDialog) chosenPath = await api.openFolderDialog();
  ```
  In the browser the API is absent and the web falls back to `prompt()`.

## Run

```bash
# 1. Build the Go engine
go build -o excelsior.exe ./cmd/excelsior

# 2a. Dev with HMR (Next dev server at :3000, Electron auto-detects it)
cd apps/web && npm i && npm run dev &         # http://localhost:3000
cd apps/electron && npm i && npm run dev      # loads http://localhost:3000

# 2b. Or with hot-reload + electron together
cd apps/electron && npm run dev:all           # concurrently + wait-on

# 2c. Prod-like (static file://, no dev server)
cd apps/web && npm run build                  # NODE_ENV=production -> dist/
cd apps/electron && npm run copy:web && npm run dev  # loads file://.../renderer/index.html
```

Engine auto-spawn: Electron spawns `../../excelsior(.exe) engine --addr :17812` unless `EXCELSIOR_AUTO_ENGINE=0`.

```bash
# run engine externally
./excelsior.exe engine --addr :17812 &
EXCELSIOR_AUTO_ENGINE=0 npm run dev

# custom WS URL
EXCELSIOR_ENGINE=ws://localhost:17812/v1/ws npm run dev
```

## Build (installer)

```bash
cd apps/electron
npm run build        # web build → copy:web → electron-builder (--win --linux)
npm run build:win    # Windows only
npm run pack         # unpacked dir for testing (no installer)
```

`extraResources` copies `apps/web/dist` to `resources/web-dist` in the packaged app, and `renderer/` is bundled via `files`. `main.js` probes both locations plus the dev server.

## Env

- `EXCELSIOR_ENGINE` — WS URL (default `ws://localhost:17812/v1/ws`)
- `EXCELSIOR_ENGINE_ADDR` — engine listen (default `:17812`)
- `EXCELSIOR_AUTO_ENGINE=0` — don't auto-spawn `../../excelsior.exe`
- `ELECTRON_START_URL` — override frontend URL (e.g. `http://localhost:3000`)

## Structure

```
apps/electron/
  main.js              — BrowserWindow, engine lifecycle, IPC, security
  preload.js           — contextBridge → window.electronAPI
  electron.d.ts        — types for preload bridge
  scripts/copy-web-dist.js — copies web/dist → renderer/
  renderer/            — generated (gitignored), copy of web/dist
  package.json         — build.files + extraResources for web-dist
```
