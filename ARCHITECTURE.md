# Architecture

One owner runs one Go engine on their computer. Desktop and future mobile clients control that engine; files, credentials for DeepSeek, tools, and chat history stay on the computer.

```text
Desktop / mobile / CLI -- WebSocket --> Go engine
                                         |-- GoAI / DeepSeek
                                         |-- workspace tools
                                         |-- atomic JSON sessions
```

## Ownership

- The engine owns runs, keyed by canonical workspace path and session ID. There is one active turn per session across all connections. Different sessions may run concurrently.
- Connections authenticate, select a workspace, subscribe, and forward commands. Disconnecting does not cancel work. The engine captures the workspace at run creation, so later client navigation cannot redirect tools.
- One mutex orders run registration, snapshots, events, and interaction replies. Tools run outside that mutex. One JSON store is reused per workspace. Rename/delete reject active sessions.
- The existing chat service owns successful-turn persistence. Missing sessions start empty; corrupted/unreadable sessions fail without overwrite. Existing JSON files retain their format. SQLite/account code is removed; old databases are untouched.
- GoAI owns provider HTTP, streaming, retries, and the tool loop. Keep the existing agent and tool boundaries; no new service framework or dependency injection layer.

## Protocol

The v1 envelope retains its existing types and adds a canonical `workspace` field on workspace-scoped responses/events. Updated clients are required because authentication is now mandatory.

1. Within five seconds of connecting, send `auth` with `{token}`. No other operation is accepted first. The response includes `{ok:true,workspace}`. Tokens are never placed in URLs.
2. `workspace.set` acknowledges the canonical workspace, followed by `session.list`. This clears the connection's old subscriptions. Clients ignore queued events from another workspace.
3. `session.data` or `session.subscribe` returns a `session.data` snapshot and subscribes atomically. The snapshot contains `id`, `messages`, `running`, optional `runId`, current-turn `events`, and optional `pending` interaction envelope. Apply the snapshot before subsequent live events.
4. `chat.req` starts a run and broadcasts its initial snapshot, then deltas. Completion is broadcast after persistence and releasing the session. Concurrent starts return a session-busy error.
5. Approval/question requests and replies carry `sessionId`, `runId`, and `interactionId`. First valid reply wins. `interaction.done` clears the prompt on every subscribed client. Stale replies fail.
6. `chat.cancel` takes `{sessionId,runId}`. Cancellation is separate from disconnecting. Desktop Escape cancels when no interaction dialog is open.

Slow subscribers are disconnected rather than losing events silently. Reconnect and request a snapshot to recover. Current-turn text fragments are coalesced in memory; no event database or durable replay log is introduced.

## Running and connecting

`excelsior engine` listens on `127.0.0.1:17812` by default. It creates a random 256-bit owner token in the OS user-config directory under `excelsior/owner-token`. The directory is restricted to the owner (Windows ACL / Unix permissions). `EXCELSIOR_TOKEN_FILE` can select a token file inside a dedicated configuration directory.

- `excelsior engine token` prints the token for manual pairing. Keep it private.
- `excelsior engine rotate-token` replaces it. Restart the engine and update clients to revoke previous access.
- Desktop obtains the token through its preload bridge only for its configured engine URL. Remote clients can paste a token into Settings; it is kept in browser session storage per URL.
- `excelsior --engine ws://localhost:17812/v1/ws --session my-chat "hello"` uses the daemon. `EXCELSIOR_ENGINE_TOKEN` selects a remote engine's token. Without `--engine`, CLI execution remains standalone. Engine configuration and permission policy govern remote execution.
- `--origin` sets exact allowed browser origins. Defaults cover packaged Electron (`null`) and development (`http://localhost:3000`). Native clients omit Origin but still authenticate.
- For remote access, run the engine independently and use an encrypted private network or a private TLS gateway with `wss://`. Bind an explicit private interface when needed. The engine itself serves HTTP/WebSocket; public exposure, TLS certificate management, and relay hosting are outside this change.

## Limits

One engine process per workspace; standalone CLI and daemon should not write the same session simultaneously. Runs survive client disconnects, not process restarts. Completed history survives restart; failed/canceled partial turns are not saved. No automatic run recovery, account system, mobile UI, or database migration is included.

For remote control, use an externally started engine. Closing Electron stops an engine it spawned, but never stops an external engine. Frontend assets remain separate from the Go binary.
