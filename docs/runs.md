# Runs: single active run + cancel/persist guard

## One active run per session

`c.runs map[string]*activeRun` (`internal/chat/coordinator.go:101`) holds live turns only.

- Key: `sessionKey(workspace, sessionID)` = `CanonicalWorkspace + "\x00" + id` (`coordinator.go:52`).
- Insert in `ReserveTurn():198`, delete in `finish():409`.
- Second `ReserveTurn` on same key → `ErrSessionBusy` (`coordinator.go:174`).
- Finished runs live on as `terminal[key]` snapshots, not in `runs`.

So lookup by `(workspace, sessionID)` is sufficient. `runID` in `Cancel():414-420` is a staleness guard only: late cancel for a finished run must return `ErrRunNotFound`, not kill the next turn.

## Why `if run.state != "persisting"` skips `cancel()`

`Cancel():421` and `Shutdown():627` share the guard.

States: `preparing → running / waiting_for_interaction → persisting → finish`. `OnPersist` (`coordinator.go:304-312`) flips to `persisting` only if `run.ctx` is still alive, then `svc.RunPrepared` commits to the store.

Canceling *during* commit buys nothing and corrupts the outcome: the outcome switch (`coordinator.go:327`) reports `canceled` when `!persisting && ctx.Err() != nil`. A late cancel would turn a success into `canceled`/`persistence_failed` with `UnsavedAvailable=true`.

The race is real, not millisecond-theoretical:

- Client cancel takes 10–100ms over websocket + `c.mu` wait; server may enter `persisting` (disk I/O, 4MB projection clone, `retainLocked`) in that window.
- `Shutdown` cancels all runs at once and will always catch some mid-commit.

Rule: cancel pre-commit work, let in-flight commits drain to disk.
