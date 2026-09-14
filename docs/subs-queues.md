# Why a session has subs, and a sub has a queue

Two levels, two different problems.

## Session → set of subs (many watchers)

`Coordinator.subs: map[sessionKey][]set of *Subscription` (`internal/chat/coordinator.go:102`),
keyed by `workspace + "\x00" + sessionID` (`coordinator.go:52`).

One session is watched by many sockets: 3 tabs on `s1` = 3 subs in the set.
`publishLocked():385` fans one `Update` out to all of them. A single shared
`subs[sessionID]: [data]` slice would force one shared read position — the
slowest tab stalls everyone, or you reinvent per-reader offsets (queues again,
with extra steps).

Per-watcher pipes isolate pace: tab B freezing evicts only tab B
(`ErrSlowSubscriber`), never tab A. Same ID in two folders are two keys, two
stores, two audiences — no cross-folder leak.

## Sub → queue (one watcher's backlog)

`Subscription{Workspace, SessionID, queue chan queuedUpdate/128, bytes, closed, err,
unsubscribe}` (`internal/chat/subscription.go:32`).

* **Lock separation:** coordinator enqueues under `mu` (ordering boundary) and
  returns fast; `forwardSubscription` blocks in `sub.Next()` with no lock held.
  Draining a shared slice under `mu` would serialize all sessions behind one
  stalled socket.
* **Backpressure per watcher:** 128 msgs + 16MB budget (`subscription.go:11,50`),
  mirroring `Conn.send` (`docs/backpressure.md`). Overflow evicts that sub only.
* **Order:** snapshot seeded first, then deltas → interactions → outcome.
  `Resnapshot` reuses the queue so a fresh snapshot can't overtake a queued
  terminal `Outcome`.
* **Lifecycle in one bundle:** frozen `Workspace` identity, `bytes/closed/err`
  state, `unsubscribe` closure (removes from set, prunes empty keys,
  `closeQueue()` wakes the forwarder with `io.EOF`). A bare channel carries none
  of this.

## Conn side mirror

`Conn.subs: map[sessionID]→*sub` (`pkg/engine/conn.go:28`) — one socket's view:
one pipe per session it watches, one `forwardSubscription` goroutine each,
multiplexed onto one websocket. `current := c.subs[id] == sub` sends only
through the registered pipe.

Collapse either level and slow consumers become everyone's problem.

## Separation of concern: produce vs consume

The queue is the seam; each side knows nothing about the other.

* **Producer (execution):** agent → `appendAndBroadcastEvent` / `waitInteraction` /
  `finish` → `publishLocked(key, Update)` (`coordinator.go:385`). Knows sessions,
  ordering (`mu` held only for the enqueue instant), and per-watcher budgets.
  Knows nothing about websockets, JSON envelopes, or socket backpressure.
* **Consumer (transport):** `Subscribe` wires the pipe + seeds the snapshot
  (`coordinator.go:426`); `forwardSubscription` (`conn.go:325`) drains via
  `sub.Next()` with no lock held → `trySendEnvelope` → `writePump` → socket.
  Knows frames, deadlines, and `Conn.send` budgets. Knows nothing about the LLM,
  tools, or `Store.Save`.

Guards sit on opposite sides of the same queue and fail independently:
producer-side overflow evicts one sub (`publishLocked` delete + warn);
consumer-side staleness skips sends (`current := c.subs[id] == sub`) and slow
sockets die via `trySendEnvelope → false → close()` (`docs/backpressure.md`).
