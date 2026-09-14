# Backpressure: `send` queue + `queuedBytes`

Two guards protect one websocket from a slow client.

## Guards

- `Conn.send chan []byte, 128` (`pkg/engine/conn.go:38`) — max **count** pending per socket.
- `Conn.queuedBytes atomic.Int64` (`pkg/engine/conn.go:29`) — total **bytes** pending per socket, capped at `chat.MaxSubscriptionBytes = 16MB` (`internal/chat/subscription.go:11`).
- Per-session copy exists one layer up: `Subscription.queue chan queuedUpdate, 128` (`internal/chat/coordinator.go:438`) with the same 16MB cap (`internal/chat/subscription.go:50`).

Count alone is not enough: 128 × 1KB vs 128 × 2MB snapshots differ by 2000×. `len(chan)` can't see bytes, so we track them manually.

## Reserve / refund

`trySendEnvelope` (`pkg/engine/conn.go:64-89`):

1. `Add(+len(b))` reserves budget, returns new total.
2. Over 16MB → `Add(-len(b))` refunds, `return false`.
3. `select { case <-done: refund+drop / case send<-b: keep / default: refund+drop }`.
4. `writePump` (`pkg/engine/conn.go:125`) does `Add(-len(msg))` only after bytes hit the socket.

Check-then-add would race (10 goroutines see 15MB, all add). Add-then-check decides on the post-add total.

`atomic.Int64` because N `forwardSubscription` writers (`pkg/engine/conn.go:325`, one per session) share one counter with one `writePump` reader. No mutex needed for a single counter.

## Slow consumer

Produce (`trySendEnvelope`) > consume (`writePump`) → counter climbs → next send hits `>16MB` or `default:` (buffer full) → `false`.

`false` is fatal, not a single drop:

- `sendEnvelope:59` → `close()`
- `forwardSubscription:361` → `close(); return`

`close()` (`pkg/engine/conn.go:95`) runs once via `closeOnce`, closes `done`, subs, socket.

## Realism

- Healthy tab: queue ~0. Deltas (`pkg/engine/runs.go:12`) are ~0.2–2KB, drained instantly.
- Stalled tab (sleep, frozen tab, breakpoint): 50 msgs/s × 3s = 150 pending → 128 trips in seconds.
- 16MB trips on `sessionDataFromSnapshot` (`pkg/engine/runs.go:49`) — full history + tool output — or several sessions sharing one `Conn`.

Slow-consumer disconnect is intentional: fail the socket instead of OOMing the server or sending partial streams. See `docs/flows.md:15`.
