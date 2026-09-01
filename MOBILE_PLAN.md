# Mobile Plan — Local-First (no cloud)

> Prompt on phone → agent runs on your laptop → live updates on both devices.
> Local dev only: one `excelsior engine` per laptop, sqlite at `.excelsior/excelsior.db`, auth is username/password against that DB. No cloud relay, no multi-laptop sync in v1.

## 1. Mental model (single laptop)

```
[Mobile Expo App] ──ws://<laptop>:17812/v1/ws?token=...──┐
[Electron App]    ──ws://localhost:17812/v1/ws?token=...─┼──► [Hub on laptop] ──► agent.RunWithHistory ──► DeepSeek
                                                         └── broadcast delta/done/error to all conns subscribed to same sessionId+user
```

Mobile picks one laptop by URL (Bonjour/mDNS or manual `ws://192.168.x.x:17812` for local dev). Each laptop has its own DB — history lives where the agent ran. No cross-laptop merge in v1.

## 2. What already exists (reuse)

- `pkg/protocol/protocol.go:14` versioned `Envelope` + `ChatReq/Delta/AskReq/PermissionReq` and `pkg/engine/hub.go:23` WS hub. `apps/electron/lib/protocol.ts:1` + `apps/electron/lib/useEngine.ts:21` are the canonical TS client — move to `packages/protocol-ts/` and reuse on mobile verbatim.
- `pkg/session/store.go:28` `Store` interface — keep it, add sqlite impl.
- `pkg/engine/conn.go:164` `sendEnvelope` drops deltas on full buffer; `chat_handler.go:98` `deltaForwarder` is unicast to origin conn — the bug that prevents dual-sync.

## 3. Lazy choices (dev-local)

| Need | Take | Skip until |
|------|------|-----------|
| sqlite driver | `modernc.org/sqlite` pure Go (no CGO, works win/mac/linux) | `mattn/go-sqlite3` (needs CGO) |
| hashing | `golang.org/x/crypto/bcrypt` cost 10 | argon2 |
| tokens | opaque `32B crypto/rand base64url` row in `tokens` table, 30d expiry | JWT lib (`golang-jwt/jwt`) |
| DB location | `<workspace>/.excelsior/excelsior.db` (one per workspace) | central DB / Turso |
| multi-laptop | user picks URL; no auto discovery beyond mDNS | cloud relay / laptop mesh |

## 4. Schema — single DB file

```sql
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tokens(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);

CREATE TABLE IF NOT EXISTS sessions(
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '[]', -- JSON []llm.Message, keeps migration trivial
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_updated ON sessions(user_id, updated_at DESC);
```

Pragmas on open: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`.

## 5. Packages (min files)

```
pkg/db/db.go              Open(path) (*sql.DB, error) — creates dir, sets pragmas, runs schema
pkg/auth/
  auth.go                 Register(ctx, username, password) (token, error) + Login same
  token.go                ValidateToken(token) (userID int64, username string, error) + CleanupExpired
  errors.go               ErrUserExists, ErrInvalidCredentials, ErrTokenExpired, typed AuthError
  store.go                SQL for users/tokens (bcrypt inside)
  schema.sql              (embedded via go:embed)
pkg/session/sqlite/
  store.go                type SQLiteStore struct{db *sql.DB; userID int64} implements session.Store
                          every query adds WHERE user_id=?
  migrate.go              one-time: if .excelsior/sessions/*.jsonl exists, import into sqlite
pkg/engine/
  hub.go                  add DB *sql.DB; Auth *auth.Store
  conn.go                 add userID int64; username string; subscribed map[string]bool + sessionSubs on Hub
  handlers.go             no change (calls c.sessionStore() which now returns SQLiteStore)
  auth_handlers.go        POST /v1/auth/register, POST /v1/auth/login, GET /v1/auth/me
pkg/protocol/protocol.go  add TypeAuthRegister/Login, AuthReq/Resp, TypeSessionSubscribe + SessionSubscribeReq
packages/protocol-ts/     extract from apps/electron/lib/protocol.ts + useEngine.ts (shared by Electron+Mobile)
apps/mobile/              Expo + TypeScript, LoginScreen -> ChatScreen, uses protocol-ts
```

## 6. Flow

**Register/Login**
```
POST /v1/auth/register {username,password} -> {token, username}  200 or 409 ErrUserExists
POST /v1/auth/login    {username,password} -> {token, username}  200 or 401
GET  /v1/auth/me       Authorization: Bearer <token> -> {username}
```
Validation: username `^[a-zA-Z0-9._-]{3,32}$`, password `8..128`. Rate limit auth routes: 5/min/IP via `sync.Map` (no new dep).

**WS auth** — `Hub.serveWS` checks `?token=` or `Authorization: Bearer` *before* `upgrader.Upgrade`. On fail 401, on success `Conn{userID,username}`. `Conn.sessionStore()` returns `sqlite.NewStore(hub.DB, c.userID)` so listing/loading is automatically per-user; user A cannot load user B's session even if id guessed.

**Dual-sync**
- Both devices `send("session.subscribe",{id})` when opening a chat.
- Sender `send("chat.req",{sessionId,messages})`.
- Hub's `deltaForwarder` does `hub.BroadcastToSession(sessionID, userID, envelope)` instead of `c.sendEnvelope` — first lazy fix that makes both devices see `text/reasoning/tool_start/tool_result/done`. Filter by `userID` prevents cross-user leak.
- On reconnect, `session.data` loads full history from sqlite — source of truth for missed deltas.

## 7. Implementation order (local-first)

| Phase | Scope | Verify |
|-------|-------|--------|
| P0 db+auth | `pkg/db`, `pkg/auth` (bcrypt, opaque tokens), handler routes | `go test ./pkg/auth -run TestRegisterLogin` + `curl POST /v1/auth/register` |
| P1 sqlite sessions | `pkg/session/sqlite.Store` implements `session.Store` interface, `MigrateFromDirStore` | `go test -race ./pkg/session/...` parametrized DirStore vs SQLiteStore |
| P2 hub wiring | `serveWS` auth, per-user store, `BroadcastToSession` fan-out | two `wscat` with same token+session see same delta; other user's conn sees nothing; `go test -race ./pkg/engine` |
| P3 mobile MVP | `apps/mobile` Expo, `packages/protocol-ts`, Login -> Chat, `ask.req`/`permission.req` sheets | phone on same wifi `ws://<laptop-ip>:17812` streams live, both devices update |

## 8. Explicitly NOT building (local-first)

- Cloud relay, Turso/central DB, laptop↔laptop sync — when you need history across laptops, add a sync layer then.
- JWT/OAuth/SSO — when you need stateless or 3rd-party login.
- `messages` normalized table / FTS — when `data JSON` load becomes slow; keep `util.Truncate` for titles.

## 9. Dev run

```bash
go run ./cmd/excelsior engine --addr :17812 --db .excelsior/excelsior.db
# register once
curl -X POST http://localhost:17812/v1/auth/register -H 'Content-Type: application/json' -d '{"username":"alice","password":"secret123"}'
# mobile/electron set EXCELSIOR_ENGINE=ws://<laptop-ip>:17812/v1/ws?token=<token>
```
