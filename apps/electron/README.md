# Excelsior Desktop (Electron)

Monochrome shell around `apps/gui` — same `ws://localhost:17812/v1/ws` `pkg/protocol` as `TUI`.

```bash
# run engine + desktop
go build -o excelsior.exe ./cmd/excelsior
./excelsior.exe engine --addr :17812 &
cd apps/electron && npm i && npm run dev

# or auto-spawn engine from Electron
EXCELSIOR_ENGINE=ws://localhost:17812/v1/ws npm run dev
```

Env:
- `EXCELSIOR_ENGINE` — WS URL (default `ws://localhost:17812/v1/ws`)
- `EXCELSIOR_ENGINE_ADDR` — engine listen (default `:17812`)
- `EXCELSIOR_AUTO_ENGINE=0` — don't auto-spawn `../../excelsior.exe`

Build: `npm run build` → `dist/` via `electron-builder`.
