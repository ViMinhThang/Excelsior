# 09 — Engine Daemon (process boundary over stdio)

## Goal

Run `@excelsior/engine` as a **separate process** and make the transport the
only connection: the TUI spawns the engine over **stdio**, and a future
remote/desktop client is just another `Transport` implementation. Delete
`@excelsior/agent-host`.

## Motivation

The "host" was a function-call wrapper around the harness — the boundary was a
fiction. A real process boundary delivers: crash isolation (a TUI bug cannot
kill a running agent; an agent bug cannot take down the app), decoupled
lifecycles (engine keeps running while a client reconnects), and the
architecture is enforced by the wire, not regex tests. Spec 01's transport +
spec 08's client already define both sides; this spec wires them to processes.

## Scope

- `engineEntrypoint`: `packages/engine/src/entrypoint.ts` — constructs the
  engine (SessionStore, RunStore, InteractionManager, capabilities,
  providers) and serves a `Transport` on stdio. Message loop: commands →
  command bus → acks; mutations → deltas → transport.
- TUI: `spawnEngine()` helper (node `child_process.spawn` with `stdio:
  ["pipe","pipe","inherit"]`); engine binary resolved from
  `node_modules/@excelsior/engine` (dev: `bun`/`tsx` on the TS entry, prod:
  compiled JS); fallback resolution list lives in `engine/paths.ts`.
- Engine health: heartbeat envelope every 5 s (spec 01); the client drops a
  dead engine with a restart prompt.
- Delete `packages/agent-host` and its tests.

**Non-goals:** remote/multi-client networking (a `WebSocketTransport` is a
follow-up, out of this spec), sandboxing the engine (it already runs as an
unprivileged child), desktop (cut).

## Design

### Entrypoint

```ts
// packages/engine/src/entrypoint.ts
const engine = createEngine(loadConfig());   // same assembly as tests use
const transport = createStdioTransport();
wire(engine, transport);                       // commands in, deltas out
```

- `createEngine(config)` is exported and shared by entrypoint and integration
  tests — the daemon is the same object tests talk to in-process.
- Errors: unhandled rejections are caught, logged to stderr, and answered as
  `{ok: false, error}` acks or `{kind: "error"}` deltas; the process exits
  cleanly on EOF on stdin.

### Process topology

```text
TUI process            engine process
  client ──stdio──────▶ engine daemon
         (envelopes, newline-delimited JSON)
```

### TUI details

- `apps/tui/src/platform/engine.ts`: `startEngine(workspaceRoot)` →
  `{ transport, child, stop() }`. Spawn with the workspace root + env passed
  as argv/env.
- On engine exit unexpectedly: surface `engine-crashed` state; restart on
  user action, then `client.syncAll()` — the cursor design (spec 08) makes
  resume lossless for committed state.
- Engine data dir: same `EXCELSIOR_HARNESS_DATA_DIR` env var (renamed
  `EXCELSIOR_ENGINE_DATA_DIR`, old name accepted during transition).

## Steps

1. Add `createEngine` + `entrypoint.ts`; e2e test: spawn the entrypoint with
   a fixture workspace, drive it over stdio, assert deltas.
2. Wire the TUI to `spawnEngine`; delete `getDefaultAgentHost` usage.
3. Add heartbeat + crash-reconnect handling in the TUI.
4. Delete `packages/agent-host`; remove its entry from workspace/package.json;
   update `src/__tests__/architecture.test.ts` guards.

## Acceptance Criteria

- `npm run dev` runs with the engine as a child process (verify via a
  child pid logged at startup).
- Killing the engine process mid-turn: the TUI surfaces the crash; on
  restart, committed turns are present (restart + `syncAll` test).
- All agent-host tests removed; integration tests drive the engine through
  the stdio transport.
- `npm run check` passes.
