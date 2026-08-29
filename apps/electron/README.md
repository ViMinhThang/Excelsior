# Excelsior Desktop (Electron)

Frameless Electron shell with **integrated Next.js frontend** (formerly `apps/web`, now inside `apps/electron`). The desktop loads its own static export over the same `ws://localhost:17812/v1/ws` `pkg/protocol` hub as the TUI.

```
apps/electron/app/page.tsx        ─┐
apps/electron/components/*         ├─► Next.js static export (apps/electron/dist/)
apps/electron/lib/protocol.ts     ─┘         │
                                         ▼
                                apps/electron/dist/  (Next export)
                                         │
                                apps/electron/main.js ─► BrowserWindow (file://)
                                apps/electron/preload.js ─► window.electronAPI
```

## How the frontend lives inside Electron

- **Single source of truth:** `apps/electron` now owns all UI: `app/page.tsx`, `components/Sidebar`, `Composer`, `MarkdownRenderer`, `MenuBar`, `SettingsModal`, etc., plus `lib/protocol.ts` mirroring `pkg/protocol`. Former `apps/web` has been nuked — all code lives in `apps/electron`.
- **Export for Electron:** `next.config.js` uses `output: "export"` + `assetPrefix: "./"` so `npm run build` (now `npm run build` in `apps/electron`) produces pure HTML/CSS/JS in `apps/electron/dist` that works on `file://`.
- **Bridge:** `preload.js` exposes `window.electronAPI` (contextIsolation + sandbox). `app/page.tsx` detects it:
  ```ts
  const api = (window as any).electronAPI;
  if (api?.getEngineUrl) setEngineUrl(await api.getEngineUrl());
  if (api?.openFolderDialog) chosenPath = await api.openFolderDialog();
  ```
  Desktop-only: `page.tsx` shows a banner and blocks `openFolder` when not in Electron (browser standalone disabled).

## Run (desktop-only)

> Web standalone has been removed — the Next.js frontend in `apps/web` is **renderer-only** for Electron. Browser `http://localhost:3000` is still used for HMR, but the app is only intended to run inside Electron.

```bash
# 1. Build the Go engine
go build -o excelsior.exe ./cmd/excelsior

# 2a. Dev — frontend only (no engine)
cd apps/electron && npm i && npm run dev               # next dev -p 3000 → http://localhost:3000 (frontend only)

# 2b. Dev — engine only (run separately)
cd apps/electron && npm run dev:engine                 # go run ../../cmd/excelsior engine --addr :17812
# or
go run ./cmd/excelsior engine --addr :17812

# 2c. Dev — desktop shell only (requires frontend + engine already running)
cd apps/electron && npm run dev:desktop                # electron . → loads http://localhost:3000 if up, else file://

# 2d. Full stack (frontend + desktop together, engine still separate)
cd apps/electron && npm run dev:all                    # concurrently: dev + wait-on → dev:desktop

# 2e. Prod-like (static file://, no dev server)
cd apps/electron && npm run build                      # next build (export) -> dist/ → electron-builder
# or
npm run build && npm run pack                          # unpacked dir for testing
```

Engine auto-spawn: **Disabled in dev** by default. Electron no longer spawns `../../excelsior(.exe)` unless `EXCELSIOR_AUTO_ENGINE=1`. In packaged builds it auto-spawns. To run engine externally:

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

`extraResources` copies `excelsior.exe` to resources, and `dist/` is bundled via `files`. `main.js` probes `dist/index.html` plus the dev server.

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
