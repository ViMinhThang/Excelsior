# Flow Walkthrough — Excelsior

How a prompt becomes an answer, end to end. Code references are `file:line`.

```
User ─┬─ TUI ───── local ──► Agent ──► LLM (GoAI/DeepSeek) ──► tools ──┐
      │                                                                ├─► session store (.jsonl)
      └─ Electron ─► WS engine ──► chat.Service ──► Agent ──► … ───────┘
```

Layers: `cmd/excelsior → internal/app → pkg/agent → pkg/llm (GoAI adapter) + pkg/tools`.
Transport: `pkg/engine` (WS) + `pkg/protocol` (v1 envelope). See `ARCHITECTURE.md`.

---

## 1. Startup: CLI / TUI / engine / headless

Entry: `cmd/excelsior/main.go:31 main()` → `config.FromEnv()` → cobra root → `ExecuteContext`.

- `newRootCommand()` (`main.go:48`): flags `model/workspace/system/session/engine/permission/yolo/verbose`; subcommands `run`, `tui`, `engine`, `models`, `version`.
- `PersistentPreRunE` (`main.go:62`): `yolo` forces `Permission=allow`; else parse `ask|allow|deny`.
- `RunE` (`main.go:80`): `resolvePrompt(args)` — argv, else piped stdin, else `""`.
  - Prompt + TTY-less or prompt given → `runAgent()` (`main.go:166`): one headless turn, prints text to stdout.
  - No prompt + TTY → `runTUI()`: full-screen Bubble Tea app.
  - `engine` subcommand → `pkg/engine` hub listening on `/v1/ws`.

`runAgent()` builds the world: `Validate()` → `ResolveWorkspace()` → `normalizeModel()` (flag > config > default `deepseek-v4-flash`) → headless permission handler (allow / deny / ask→auto-deny with hint) → `app.NewAgent()` → `chat.Service{Runner, Store}` → `service.Run(...)` with `chatEventPrinter` (text→stdout, reasoning/tool/error→stderr).

Composition: `internal/app/agent.go:13 NewAgent()` = `agent.Agent{LLM: &llm.Client{APIKey,BaseURL,Model}, Tools: tools.DefaultRegistry(workspace), System, Logger}`.

## 2. One chat turn (local path)

Entry: `internal/chat/service.go:28 Service.Run(ctx, req)` with `Service{Runner, Store}`, `Request{SessionID, Messages, OnEvent}`.

1. `history()` (`service.go:64`): no store/session → incoming as-is; else `Store.Load(ID)` and return `saved + incoming` (skips placeholder system messages).
2. `Runner.RunWithHistory(ctx, RunOptions{Messages, OnEvent})` — the agent runs (next section). The `OnEvent` adapter maps `agent.StreamEvent → chat.Event`.
3. Persist (`service.go:48`): strip system messages, `Load` or fresh `Record`, `record.Messages = result.Messages`, `Store.Save`. Service never renders — transport supplies `OnEvent`.

## 3. Agent loop

Entry: `pkg/agent/agent.go:144 RunWithHistory()` (`Run()` at `:133` wraps it for final-message-only callers).

Types: `Agent{LLM, Tools, System, MaxIters, Model}`, `RunOptions{Messages, OnEvent}`, `RunResult{FinalMessage, Messages, TotalUsage}`, `StreamEvent{text|reasoning|tool_start|tool_result|done|error}`.

1. `validateRunOptions` (`agent.go:162`): LLM present, messages non-empty, ≤600k chars.
2. `prepareMessages` (`:175`): prepend `{system, a.System}` unless history already starts with one.
3. `resolveModel()` (`:105`): `a.Model` override, else `LLM.ModelName()`.
4. `runNativeToolLoop()` (`:183`): single call to `StreamChatWithTools` with four callbacks:
   - `execute` — `reg.Get(name)` → `tool.Execute(ctx, argsJSON)`; unknown tool → error string.
   - `onDelta` — accumulate `Usage`, emit `reasoning`/`text` events.
   - `onToolStart` — emit `tool_start` (spinner).
   - `onToolResult` — errors become `"error: …"` text, truncate to 20k runes, emit `tool_result`.
5. Post: error → emit `error` + wrap; nil final → `ErrNilLLMMessage`; `fullHistory = messages + generated (+ final if last isn't assistant)`; emit `done`; return `RunResult`.

Tool calls run **sequentially** (`WithSequentialToolExecution`); matching is by `tool_call_id` (assistant `ToolCalls[]` ↔ `tool`-role messages).

## 4. LLM call

Entry: `pkg/llm/client.go:59` `StreamChatWithTools()`.

1. `toProviderMessages()` (`client.go:202`) — app `Message` → `provider.Message` parts (text / reasoning / tool-call / tool-result); `tool` role collapses to a single result part.
2. Convert `ToolDefinition` → `goai.Tool` (`client.go:79`) (`InputSchema = json(Parameters)`); `Execute` bridges back to the agent's `execute` via `goai.ToolCallIDFromContext`.
3. `goai.StreamText(ctx, deepseek.Chat(model, opts...), WithMessages + WithTools + WithMaxSteps + hooks)` (`client.go:124`) — **starts** the HTTP/SSE stream; startup errors return here.
4. `for chunk := range stream.Stream()` — drain live chunks; `forwardChunk` (`client.go:148`) maps text/reasoning/tool-call chunks to `Delta`, aborts on `ChunkError` or a failing `onDelta`.
5. `stream.Err()` after the loop — surfaces mid-stream failures (channel can't carry errors, so they're stashed and reported here).
6. `stream.Result()` — accumulated final state; build last-assistant `message` + full `generated` history via `fromProviderMessages()` (`client.go:269`, the part→flat inverse, what lands in jsonl).

`model()` (`client.go:35`) builds `deepseek.Chat(ResolveModel(req.Model), WithAPIKey?, WithBaseURL?, WithHTTPClient?)` — each option only when configured, so the provider default applies otherwise. Errors become `*LLMError{StatusCode, Model, Body, Err}` (`errors.go`, via `newGoAIError` at `client.go:304`) wrapping a sentinel (`ErrAuthFailed/ErrRateLimit/…`) so callers classify with `errors.Is`.

## 5. Tools

`pkg/tools`: `Registry` (`Get`/`All` sorted), `DefaultRegistry(workspace)` → 8 tools: `view, ls, glob, grep, write, edit, bash, askQuestion`.

- Read-only (`view/ls/glob/grep`) execute directly, workspace-jailed (`secureJoin`, symlink-aware), with size caps (5MB view, 2MB/file + 200 lines grep, 8KB bash cmd).
- Mutating (`write/edit/bash`) call `checkPermission()` → context handler installed via `tools.WithPermissionHandler`. No handler → allow. Deny → `ErrPermissionDenied`. CLI sets allow/deny/auto-deny; engine installs a WS round-trip handler; TUI installs dispatcher/allow/deny.
- `askQuestion` normalizes to ≤3 options, calls the question handler (`tools.WithQuestionHandler`), formats `Selected → "User selected [n]: label"`, answer, cancellation, or a no-handler fallback string.
- Writes are atomic (temp + rename + fsync); previews truncated (8k).

## 6. WebSocket engine

`pkg/engine/{conn.go, hub.go, chat_handler.go, handlers.go}`, `pkg/protocol/protocol.go`.

**Protocol:** `Envelope{Ver:"v1", ID, Type, Payload}`. Types: `chat.req/delta/done/error`, `ask.req/resp`, `permission.req/resp`, `ping/pong`, `session.{list,data,create,delete,rename,subscribe,unsubscribe}`, `workspace.set`, `settings.{get,set}`.

**Lifecycle** (`hub.go`): `NewHub` → `Handler()` (`/v1/ws`, `/v1/auth/*`, `/health`) → `serveWS`: authenticate → upgrade → `newConn` → `Register` → `go writePump` + blocking `readPump` → `Unregister + close`.

**Conn** (`conn.go`): `Conn{hub, ws, send(128), per-conn workspace, ask/perm slots, done, chatMu/chatting, subscriptions}`.

- `readPump` — client→server: 1MB read limit, 60s deadline refreshed by messages + pong handler, unmarshal → version check → `dispatchEnvelope`. One bad frame → targeted error, connection survives.
- `writePump` — server→client: the **only** socket writer (gorilla forbids concurrent writes). Drains `c.send`, 30s ping keepalive, 10s write deadlines, close frame on shutdown.
- `sendEnvelope` — producers enqueue with policy: `delta` = drop when full (ephemeral, high-volume); control (`done/error/ask/permission/...`) = wait up to 5s (load-bearing).
- Heartbeat math: ping 30s < timeout 60s, tolerating exactly one lost ping; traffic also keeps NAT/proxy mappings alive.
- Why the channel: single-writer rule + decouple producer speed from network + `select` over `{send, done, ticker}` in one loop.

**Dispatch** (`dispatchEnvelope`): `chat.req → dispatchChat` (serialized per-conn; rejects overlap with "already streaming"); `ask.resp/permission.resp → route` into the waiting slot channel; session/workspace/settings → `go handle*`; `ping → pong`; unknown → error.

**Chat flow** (`chat_handler.go:15 
`): decode `ChatReq` → `setupToolHandlers` (buffered ask/perm chans + context handlers) → `getAgent(model)` → default `sessionID = UnixMilli` → `subscribe` → `chat.Service{Runner, Store}.Run(..., OnEvent: deltaForwarder)` → `deltaForwarder` maps events → `protocol.Delta` → `BroadcastToSession` (same user + subscribed only) → final `done{sessionId}` broadcast.

**Round-trips:** `askHandler`/`permissionHandler` stash a 1-slot channel, send `ask.req`/`permission.req`, block on `{answer | ctx-done}`. Permission short-circuits on `allow`/`deny` policy before asking. Client (`WSClient`) runs the UI and replies `ask.resp`/`permission.resp`, which `route()` delivers non-blockingly.

## 7. Sessions

`pkg/session`: `Store{Save/Load/List/Delete/Latest}`, `Record{ID, Title, CreatedAt, UpdatedAt, Messages []llm.Message}`.

- `DirStore{Dir}`: one file per session `<Dir>/<sanitizedID>.jsonl` (ID regex `^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$`); CLI uses `<workspace>/.excelsior/sessions`.
- `Save`: stamp times, single-line `json.Marshal(record)+'\n'` via atomic write (`0600`).
- `Load`: missing → `ErrSessionNotFound`; scan bottom-up for first valid JSON line (corruption-tolerant: trailing garbage ignored; fully corrupt → `ErrCorruptedSession`).
- `List`: per-file meta (`MsgCount`), sorted by `UpdatedAt` desc; `Delete` is idempotent. Engine resolves per-user stores (file or sqlite); `Latest` = `List` + `Load(first)`.

## 8. TUI

`pkg/tui`: `Run(cfg)` → `tea.NewProgram(New(cfg), AltScreen, Mouse)`, wires `UISink` into ask/permission dispatchers.

- `Config`: `Agent Runner, Workspace, Model, History, EngineURL ("" = local), Ask/PermissionDispatcher, Permission`.
- Input: Enter → `/cmd` handling (`/clear/help/model/permission/yolo/deny/ask/quit`) or append `user` block → `startAgent()`.
- `startAgent` (`start.go:26`): cancellable ctx, snapshot history + prompt, `ch(128)`, resolve ask/perm handlers, `launch` in goroutine — remote: `WSClient.StreamRemote(...)`; local: `Agent.RunWithHistory(..., OnEvent → ch)`; `close(ch)`.
- Render: `streamChunkMsg → handleStreamEvent` (text/reasoning append, tool start/result blocks, re-arm `waitForChunk`); `streamDoneMsg → finalizeStreamDone` (commit user+assistant to `cfg.History`). Streaming Enter/Esc/Ctrl-C cancels; overlays for ask (arrows/1-3/manual) and permission (y/n) reply through the dispatch channels.

## 9. Config

`pkg/config`: `FromEnv()` → `Config{APIKey, BaseURL, Model, MaxTokens, Temperature, Workspace, EngineURL}` — bootstrap/env only; **no Permission field**.

Env: `DEEPSEEK_API_KEY` (required), `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`), `DEEPSEEK_MODEL` (default `deepseek-v4-flash`, `ResolveModel` = trim), `Temperature = 0.7`, `EXCELSIOR_WORKSPACE`, `EXCELSIOR_ENGINE`. `Validate`: key/model non-empty, BaseURL http(s), temperature 0–2. `ResolveWorkspace`: flag > config > cwd, must exist and be a dir.

Settings (`settings.go`): `<ws>/.excelsior/settings.json` over user-global over `EXCELSIOR_PERMISSION` env (base layer); `AllowAll=true` forces `allow`; TUI `/permission|/yolo` and engine `settings.set` persist here. Permission precedence: CLI `--permission`/`--yolo` (runtime-only override via `Hub.PermissionOverride` / `runAgent`) > workspace settings > user-global settings > env > `ask` (`permissions.Resolve`).
