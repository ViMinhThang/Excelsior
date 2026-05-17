# Runtime State Architecture

Excelsior keeps UI state, live runtime state, and persisted replay state separate.
The important rule is:

```text
AgentRun = live in-progress truth
JSONL = durable completed-turn truth
ProjectionService = turns events into UI and AI history
AgentStateStore = owns the current app snapshot
LocalAgentHost = adapts that snapshot to the TUI
```

## Application Shape

```mermaid
flowchart TD
  TUI["@excelsior/tui\nInk hooks and screens"]
  Host["LocalAgentHost\nclient-state adapter"]
  App["AgentApplication\nthin facade"]
  Store["AgentStateStore\nsnapshot + subscriptions"]
  Sessions["SessionController\nsession CRUD + event loading"]
  Turns["TurnController\nsend/cancel/run lifecycle"]
  Revert["RevertController\nlatest-turn revert"]
  Projection["ProjectionService\ndisplay + AI history"]
  Runtime["AgentRun + RunOrchestrator"]
  Disk["SQLite sessions\nJSONL events\nworkspace files"]

  TUI --> Host
  Host --> App
  App --> Store
  App --> Sessions
  App --> Turns
  App --> Revert
  Store --> Projection
  Turns --> Runtime
  Sessions --> Disk
  Revert --> Disk
  Runtime --> Disk
```

## Turn Flow

```mermaid
sequenceDiagram
  participant UI as TUI
  participant Host as LocalAgentHost
  participant App as AgentApplication
  participant Sessions as SessionController
  participant Turns as TurnController
  participant Run as AgentRun
  participant Store as AgentStateStore
  participant Disk as JSONL/SQLite

  UI->>Host: send(input)
  Host->>App: send(input)
  App->>Sessions: ensureSession(input)
  App->>Store: getProjectionInput()
  App->>Turns: startTurn(...)
  Turns->>Run: create run session
  Run->>Disk: append events
  Run-->>Turns: live event notification
  Turns->>Store: setLiveEvents(...)
  Store-->>Host: subscriber notification
  Host-->>UI: invalidate client state
  Run->>Disk: turn-complete checkpoint
  Turns->>Store: append final events + clear active run
```

## Event Sources

```mermaid
flowchart LR
  Live["Live events\nactive AgentRun snapshot"]
  Persisted["Persisted events\ncheckpoint-safe JSONL"]
  Child["Child run events\nlive or persisted"]
  Projection["ProjectionService"]
  Display["Chat display blocks"]
  History["AI history"]

  Live --> Projection
  Persisted --> Projection
  Child --> Projection
  Projection --> Display
  Projection --> History
```

`ProjectionService` centralizes the policy: while a run is active, live parent
events are used for current output; otherwise checkpoint-safe persisted events
are used for replay.

## Tool Safety

`ToolContext` is per-run operational state. It carries the workspace root,
current Plan/Act mode, confirmation bus, abort signal, and optional revert
checkpoint capability.

```text
ToolContext
  capabilities
  confirm
  abortSignal
  workspaceRoot
  mode
  revert.fileCheckpoint
```

Sub-agents receive a child `ToolContext`, so workspace bounds, cancellation,
confirmations, and revert checkpointing stay consistent.

## Revert Flow

`/revert` only reverts the latest completed turn and only file changes made by
the built-in `write` and `edit` tools.

```mermaid
sequenceDiagram
  participant Cmd as /revert
  participant Revert as RevertController
  participant Checkpoint as FileCheckpoint
  participant Files as Workspace files
  participant History as SessionHistoryStore
  participant Sessions as SessionController
  participant Store as AgentStateStore

  Cmd->>Revert: revertLastTurn()
  Revert->>Store: reject if loading
  Revert->>Checkpoint: getLatest()
  Revert->>History: getLastCompletedTurn()
  Revert->>Checkpoint: restoreLatest()
  Checkpoint->>Files: restore or delete files
  Revert->>History: dropLastCompletedTurn(runId)
  Revert->>Sessions: reloadCurrentSessionEvents()
  Sessions->>Store: setPersistedEvents(...)
```

If any checkpointed file changed after the agent turn, revert reports a
conflict and does not trim history.
