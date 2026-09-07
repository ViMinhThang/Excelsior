# Excelsior Flows

Sequence diagrams for every flow in the app. Mermaid-rendered on GitHub.

Participants:
- **UI** — Electron/Next.js frontend (`apps/electron`)
- **Engine** — Go WebSocket hub (`pkg/engine`)
- **Agent** — agent loop (`pkg/agent`) + LLM (`pkg/llm`)
- **Store** — session store (memory / sqlite / dir)

---

## 1. Connection & bootstrap

```mermaid
sequenceDiagram
    participant UI as UI (React)
    participant Engine as Engine (WS hub)

    UI->>Engine: WS connect ws://…/v1/ws
    Engine-->>UI: open
    UI->>Engine: session.list {}
    Engine->>Engine: store.List() + branchOf + gitNumstat
    Engine-->>UI: session.list {sessions[]}
    UI->>UI: pick first session, set activeId
    UI->>Engine: session.data {id}
    Engine-->>UI: session.data {messages[]}
    UI->>UI: map history -> blocks (tool_call_id -> args)
    UI->>Engine: session.subscribe {id}
```

## 2. Chat turn (happy path)

```mermaid
sequenceDiagram
    participant UI as UI
    participant Engine as Engine
    participant Agent as Agent/LLM
    participant Store as Session store

    UI->>Engine: chat.req {sessionId, model, messages[user]}
    Engine->>Engine: beginTurn(sessionId) (rejects if turn already running for session)
    Engine->>Store: history(sessionId) + incoming
    Engine->>Engine: sanitizeToolCalls (patch dangling tool_calls)
    Engine->>Agent: RunWithHistory
    loop stream
        Agent-->>Engine: text / reasoning / tool_start / tool_result / usage
        Engine-->>UI: delta {sessionId, type, …}
        UI->>UI: append/coalesce into session buffer
    end
    Agent-->>Engine: done {usage}
    Engine->>Store: save replay-safe history (sans system)
    Engine-->>UI: done {sessionId}
    UI->>UI: clear streaming flag for session
```

## 3. Tool call (bash / edit)

```mermaid
sequenceDiagram
    participant Agent as Agent/LLM
    participant Engine as Engine
    participant UI as UI

    Agent->>Agent: model emits tool_calls
    Agent-->>Engine: tool_start {name, args}
    Engine-->>UI: delta tool_start {sessionId, toolName, toolArgs}
    UI->>UI: new tool block (args in content)
    Agent->>Agent: execute tool (workspace-jailed)
    Agent-->>Engine: tool_result {output}
    Engine-->>UI: delta tool_result {sessionId, toolResult}
    UI->>UI: merge result into pending tool block (args moved)
```

## 4. Permission request (mutating op)

```mermaid
sequenceDiagram
    participant Tool as Tool (edit/bash)
    participant Engine as Engine
    participant UI as UI

    Tool->>Engine: PermissionRequest
    Engine->>Engine: permissions.Resolve (settings / --yolo)
    alt allow
        Engine-->>Tool: approved
    else deny
        Engine-->>Tool: denied
    else ask (default)
        Engine-->>UI: permission.req {sessionId, tool, path/command, preview}
        UI->>UI: queue in session, render if active
        opt Allow-all pressed
            UI->>Engine: settings.set {allowAll:true}
        end
        UI->>Engine: permission.resp {sessionId, approved}
        Engine-->>Tool: PermissionResponse
    end
    Note over UI: Esc = approved:false
```

## 5. Ask question (askQuestion tool)

```mermaid
sequenceDiagram
    participant Agent as Agent (tool)
    participant Engine as Engine
    participant UI as UI

    Agent->>Engine: AskRequest {question, options[3]}
    Engine-->>UI: ask.req {sessionId, question, options}
    UI->>UI: queue in session, render AskDialog if active
    UI->>Engine: ask.resp {sessionId, selected, answer, label}
    Engine-->>Agent: AskResponse
    Agent-->>Agent: "User selected [n]" / "User answered: …"
    Note over UI: Esc = no answer ("User provided no answer.")
```

## 6. Parallel sessions

```mermaid
sequenceDiagram
    participant UI as UI
    participant Engine as Engine
    participant Agent as Agent/LLM

    UI->>Engine: chat.req {sessionId: A}
    Engine->>Agent: turn A starts (streaming)
    UI->>Engine: chat.req {sessionId: B}
    Note over Engine: different session -> concurrent turn
    Engine->>Agent: turn B starts
    par A streams while user works in B
        Engine-->>UI: delta {sessionId: A, …}
        UI->>UI: buffer into A only (B visible)
    and
        Engine-->>UI: delta {sessionId: B, …}
        UI->>UI: buffer into B only
    end
    UI->>Engine: chat.req {sessionId: A} (duplicate)
    Engine-->>UI: error "already streaming, wait for done"
```

## 7. Session switch / load history

```mermaid
sequenceDiagram
    participant UI as UI
    participant Engine as Engine
    participant Store as Session store

    UI->>Engine: workspace.set {workspace} (if folder changed)
    UI->>Engine: session.data {id}
    Engine->>Store: load messages
    Engine-->>UI: session.data {messages[] incl. assistant tool_calls}
    UI->>UI: setActiveId(id), rebuild block buffer,<br/>tool blocks get args via tool_call_id
    UI->>Engine: session.subscribe {id}
    Note over UI,Engine: previous turn keeps streaming into its own buffer
```

## 8. Session create

```mermaid
sequenceDiagram
    participant UI as UI
    participant Engine as Engine
    participant Store as Session store

    UI->>Engine: session.create {title}
    Engine->>Store: create record
    Engine-->>UI: session.create {id}
    UI->>UI: setActiveId(id), empty buffer
    Engine-->>UI: session.list (refresh)
```

## 9. Session delete / rename

```mermaid
sequenceDiagram
    participant UI as UI
    participant Engine as Engine
    participant Store as Session store

    UI->>Engine: session.delete {id}
    Engine->>Store: delete
    Engine-->>UI: session.delete {deleted}
    Engine-->>UI: session.list (refresh)
    Note over UI: if deleted == active: clear view
    UI->>Engine: session.rename {id, title}
    Engine->>Store: update title
    Engine-->>UI: session.rename + session.list (refresh)
```

## 10. Settings

```mermaid
sequenceDiagram
    participant UI as UI
    participant Engine as Engine
    participant Store as Settings store

    UI->>Engine: settings.set {allowAll, permission} (on connect / toggle)
    Engine->>Store: save workspace settings.json
    UI->>Engine: settings.get {}
    Engine-->>UI: settings.get {permission, allowAll}
```

## 11. Open folder (desktop only)

```mermaid
sequenceDiagram
    participant UI as UI
    participant Electron as Electron API
    participant Engine as Engine

    UI->>Electron: openFolderDialog()
    Electron-->>UI: path
    UI->>UI: persist to knownFolders (localStorage)
    UI->>Engine: workspace.set {workspace: path}
    UI->>Engine: session.create {title: "<name> session"}
```

## 12. Headless CLI run

```mermaid
sequenceDiagram
    participant CLI as CLI (excelsior "prompt")
    participant Agent as Agent/LLM
    participant Store as Session store (optional)

    CLI->>CLI: resolve cfg, workspace, model, permission
    CLI->>Agent: RunWithHistory {messages: [user]}
    loop stream
        Agent-->>CLI: reasoning / text / tool events (printer)
    end
    CLI->>Store: save history (only when --session given)
```

## 13. Engine daemon

```mermaid
sequenceDiagram
    participant Op as Operator
    participant Engine as Engine hub
    participant Auth as Auth (optional)

    Op->>Engine: excelsior engine --addr :17812 [--auth]
    Engine->>Auth: open SQLite, cleanup expired tokens (if --auth)
    loop serve
        Engine->>Engine: accept WS, register conn,<br/>dispatch per-session turns,<br/>broadcast deltas to subscribers
    end
```

## 14. Agent loop internals (Go)

```mermaid
sequenceDiagram
    participant Svc as chat.Service
    participant Agent as Agent
    participant LLM as DeepSeek (GoAI)
    participant Tools as Tool registry

    Svc->>Agent: RunWithHistory (history + new user msg)
    Agent->>Agent: prepareMessages (system + sanitizeToolCalls)
    Agent->>LLM: StreamChatWithTools (tools, maxSteps)
    loop until no tool_calls or maxIters
        LLM-->>Agent: deltas (text/reasoning/tool calls)
        Agent->>Tools: execute call (workspace-jailed, permission-gated)
        Agent->>LLM: tool result message
    end
    Agent-->>Svc: final message + full history + usage
```
