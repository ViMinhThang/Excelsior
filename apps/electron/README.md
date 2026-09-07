# Excelsior Desktop

Electron loads a static Next.js frontend and connects to the personal Go engine over WebSocket. The Go engine owns work and history; the UI can reconnect to an active run.

## Development

From the repository root, build the engine:

```sh
go build -trimpath -ldflags "-s -w" -o excelsior.exe ./cmd/excelsior
```

In separate terminals, run `npm run dev:engine` and `npm run dev` from `apps/electron`. Development does not auto-start an engine unless `EXCELSIOR_AUTO_ENGINE=1`. Local desktop authentication loads the owner token through the preload bridge.

## External engine / future mobile access

Run `excelsior engine --workspace <project>` independently. Set `EXCELSIOR_ENGINE` to its WebSocket URL before launching Electron; this disables auto-spawn. Closing desktop then leaves the external engine and its runs alive.

For a remote engine, set `EXCELSIOR_ENGINE_TOKEN` or paste its owner token into Settings. Manual tokens are scoped to the URL in browser session storage. Use an encrypted private network or a private TLS gateway. Add the client origin with the engine's `--origin` flag if needed. Mobile UI is not implemented yet.

Selecting a session restores its history, partial output, and pending question/approval. Either connected device can answer; stale replies are rejected. Escape dismisses a pending interaction or cancels the active run if no dialog is open. Permission settings are read from the engine and changed only on explicit user action.

## Packaging

```sh
npm run build:win   # Next.js static export and Windows installer
npm run pack       # unpacked application
```

Build the Go executable first. Packaging copies `excelsior.exe` alongside `dist/`; frontend assets are not embedded in Go. Packaged desktop auto-spawns the local engine unless external mode is selected. An engine spawned by Electron stops when Electron exits.

## Environment

- `EXCELSIOR_ENGINE`: external engine URL (default connection: `ws://localhost:17812/v1/ws`).
- `EXCELSIOR_ENGINE_TOKEN`: token for that configured engine.
- `EXCELSIOR_ENGINE_ADDR`: auto-spawn listen address, default `127.0.0.1:17812`.
- `EXCELSIOR_AUTO_ENGINE=0`: disable auto-spawn; `1` enables it in development.
- `EXCELSIOR_TOKEN_FILE`: shared Go token-file override in a dedicated configuration directory.
- `ELECTRON_START_URL`: renderer URL override.

See the root [architecture document](../../ARCHITECTURE.md) for the protocol and process limits.
