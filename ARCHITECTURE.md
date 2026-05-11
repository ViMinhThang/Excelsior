# Excelsior Architecture

An event-driven AI agent runtime built on session-scoped event buses, append-only event logs, and pure projection functions.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Types](#2-core-types)
3. [AgentSession — The Core Runtime Object](#3-agentsession--the-core-runtime-object)
4. [Event Vocabulary](#4-event-vocabulary)
5. [Streaming Pipeline](#5-streaming-pipeline)
6. [Persistence Layer](#6-persistence-layer)
7. [Projection System](#7-projection-system)
8. [Sub-Agent Architecture](#8-sub-agent-architecture)
9. [React Integration](#9-react-integration)
10. [Review Orchestrator](#10-review-orchestrator)
11. [Database Schema](#11-database-schema)
12. [File Inventory](#12-file-inventory)
13. [Architectural Principles](#13-architectural-principles)

---

## 1. Architecture Overview

The system evolved from a message-based chat model to an event-driven agent runtime. The core insight: AI execution is a continuous event stream, not discrete chat bubbles. Messages are a UI concern. Events are the runtime reality.

### Data Flow

```
AI SDK Runtime (ToolLoopAgent.fullStream)
       │
       ▼
AgentSession.emit(type, data)
       │
       ├─▶ Append-only Event Log (_events[])
       │       └─ source of truth, persisted to SQLite
       │
       ├─▶ Event Bus (createBus)
       │       └─ live distribution to subscribers
       │
       └─▶ Snapshot Cache (_snapshot)
               └─ for useSyncExternalStore (React)
```

### Consumers (independent subscribers)

```
Event Bus
  ├─▶ Persistence subscriber (collects events, batch writes at session-end)
  ├─▶ React UI (useSyncExternalStore → getSnapshot)
  ├─▶ Debugger/Trace (future)
  └─▶ subAgentBus forwarding (review screen compatibility)
```

---

## 2. Core Types

### `AgentEvent` — The atomic execution fact

```typescript
interface AgentEvent {
  id: string;                    // unique, monotonic
  sessionId: string;             // owning session
  sequence: number;              // order within session
  type: AgentEventType;          // see vocabulary below
  timestamp: string;             // ISO 8601
  data: Record<string, unknown>; // type-specific payload
  parentEventId?: string;        // for child session nesting
  relatedToolCallId?: string;    // correlation across events
}
```

Events are immutable — `Object.freeze(event)` is called in `emit()`. No subscriber can tamper with history.

### `Session` — Execution metadata

```typescript
interface Session {
  id: string;
  startedAt: string;
  updatedAt: string;
  metadata: { userInput: string };
}
```

### `DisplayBlock` — UI projection (never persisted)

```typescript
type DisplayBlock =
  | { type: "user";       id: string; content: string; timestamp: string }
  | { type: "assistant";  id: string; content: string; timestamp: string }
  | { type: "tool-call";  id: string; toolName: string; toolArgs: string;
        status: "pending"|"completed"|"error"; content: string; timestamp: string }
  | { type: "sub-agent";  id: string; role: string;
        state: SubAgentDisplayState; timestamp: string };
```

### `SubAgentDisplayState` — Runtime sub-agent state

```typescript
interface SubAgentDisplayState {
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  toolCalls: ToolCallInfo[];
  parts: SubAgentPart[];
  startTime?: number;
  endTime?: number;
}
```

---

## 3. AgentSession — The Core Runtime Object

Every agent execution is encapsulated in an `AgentSession`. The class owns three things: an event bus (transport), an append-only event log (source of truth), and a subscription API for React integration.

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentSession                             │
│                                                             │
│  bus: createBus<{ event: AgentEvent }>   ← transport       │
│  _events: AgentEvent[]                    ← source of truth│
│  _snapshot: readonly AgentEvent[]         ← cached snapshot│
│                                                             │
│  emit(type, data, overrides?)             ← append + notify │
│  cancel()                                  ← abort + cleanup│
│  getSnapshot(): readonly AgentEvent[]      ← for React      │
│  subscribe(cb): () => void                 ← for React      │
└─────────────────────────────────────────────────────────────┘
```

### Key implementation details

- **`emit()`** creates the event, freezes it, appends to `_events`, updates `_snapshot`, emits on bus, and schedules a batched React notification.
- **`_snapshot`** is a cached copy (`[..._events]`), updated synchronously in `emit()` so React reads are consistent.
- **Notifications** are batched via `setTimeout(0)` — rapid events coalesce into one render.
- **`cancel()`** aborts via `AbortController` and clears the pending notification timer.
- **`flushNotify()`** forces an immediate notification (called on session-end).

```typescript
class AgentSession {
  readonly id: string;
  readonly bus = createBus<{ event: AgentEvent }>();
  readonly parentEventId?: string;
  abortController?: AbortController;

  emit(type, data, overrides?): AgentEvent;
  cancel(): void;
  flushNotify(): void;
  getSnapshot(): readonly AgentEvent[];
  subscribe(cb): () => void;
}
```

---

## 4. Event Vocabulary

All events share the `AgentEvent` shape. The `type` field determines the `data` payload.

| Type | Data | When | Role |
|---|---|---|---|
| `session-start` | `{}` | Before first `await` in `agent.stream()` | Bookends execution frame |
| `user-input` | `{ content }` | Caller emits before `streamAgentResponse` | Marks turn boundary |
| `text-delta` | `{ delta }` | Per token from AI SDK | Raw provider artifact (delta only, not fullText) |
| `tool-call-start` | `{ toolName, toolArgs, toolCallId }` | AI SDK tool-call part | Correlated to end via `relatedToolCallId` |
| `tool-call-end` | `{ toolCallId, result, status }` | AI SDK tool-result / tool-error | `status`: "success" or "error" |
| `child-session-attached` | `{ childSessionId, parentToolCallId, role }` | Sub-agent spawns | Records execution graph edge |
| `error` | `{ message }` | Catch in `streamAgentResponse` | Non-abort errors |
| `session-end` | `{ cancelled }` | Stream loop completes | Terminal event; triggers `flushNotify` |

### Design rule

Store only execution facts. `text-delta` is a provider artifact — it records exactly what the SDK sent. Semantic events like `assistant-message-complete` are NOT stored; they are derived at projection time.

---

## 5. Streaming Pipeline

```
useChatSender.sendMessage(content)
  │
  ├─ new AgentSession()
  ├─ session.emit("user-input", { content })
  ├─ streamAgentResponse(agent, messages, session, signal)
  │     │
  │     ├─ session.emit("session-start")
  │     ├─ for each stream part:
  │     │     text-delta    → session.emit("text-delta", { delta })
  │     │     tool-call     → session.emit("tool-call-start", { name, args, callId })
  │     │     tool-result   → session.emit("tool-call-end", { callId, result, status })
  │     │     tool-error    → session.emit("tool-call-end", { callId, result, status: "error" })
  │     ├─ session.emit("session-end")
  │     └─ Promise resolves
  │
  ├─ cleanup: persistEvents(allEvents)
  └─ RETURN session (synchronous, before first await!)
```

### Critical: synchronous session return

`sendMessage()` returns the `AgentSession` **synchronously** before any streaming begins. The caller attaches React subscribers before the first event is emitted. This eliminates race conditions between subscriber setup and event emission.

---

## 6. Persistence Layer

### Write path (batched at session-end)

```typescript
// Event bus subscriber collects all events
const allEvents: AgentEvent[] = [];
session.bus.on("event", (event) => {
  if (event.type !== "session-start") {
    allEvents.push(event);
  }
});

// On stream completion:
persistEvents(allEvents);  // single batch write
```

No per-event DB writes during streaming. The `user-input` event is persisted immediately (so the user sees their message appear even if the server crashes).

### Read path

```typescript
// Load sessions + events on mount
loadSessions(limit, offset)     → Session[]
loadSessionEvents(sessionId)   → AgentEvent[]

// Load older history
loadMore(count)                → prepends older sessions + events
```

### eventPersistence.ts functions

| Function | Purpose |
|---|---|
| `persistSession(session)` | Write session metadata |
| `persistEvents(events)` | Bulk write events |
| `persistEvent(event)` | Write single event |
| `loadSessions(limit, offset)` | Paginate sessions |
| `loadSessionEvents(sessionId)` | Load all events for a session |
| `getSessionCount()` | Total sessions |
| `deleteAllSessions()` | Wipe all data |
| `projectEventsToAIHistory(events)` | Convert events to AI SDK message format |

---

## 7. Projection System

The projection is a pure function that transforms `AgentEvent[]` into `DisplayBlock[]` for UI rendering.

```typescript
function groupEventsForDisplay(
  events: readonly AgentEvent[],
  options?: ProjectOptions,
): DisplayBlock[]
```

### Projection rules

| Events | Creates |
|---|---|
| `user-input` | One `user` block |
| Consecutive `text-delta` events | One `assistant` block (text accumulated via delta addition) |
| `tool-call-start` + `tool-call-end` | One `tool-call` block |
| `child-session-attached` + child events (fetched via `getChildEvents`) | One `sub-agent` block (projected from child session's own events) |

### Projection invariants

- **Pure**: same events → same display blocks
- **Deterministic**: no randomness, no date/time dependence
- **Side-effect free**: does not mutate events or external state
- **Order-preserving**: event sequence determines block sequence

### Child session projection

When the projection encounters a `tool-call-end` for a `spawnSubAgent` tool:

1. Look up the `child-session-attached` event for that `parentToolCallId`
2. Get the `childSessionId` and `role`
3. Call `options.getChildEvents(childSessionId)` to fetch child session events
4. Walk child events: accumulate text-deltas into `fullOutput`, track tool calls into `parts` and `toolCalls`
5. Emit a `sub-agent` DisplayBlock inline at the tool-call-end position

No child events are forwarded into the parent event log. The parent log remains pure — it contains only parent-originated events.

---

## 8. Sub-Agent Architecture

Sub-agents use the exact same `AgentSession` model as the main chat. A sub-agent is not "special" — it is just another `AgentSession` with a parent linkage.

### Factory function

Instead of a static tool, `spawnSubAgent.ts` exports a factory:

```typescript
function createSpawnSubAgentTool(
  parentSession: AgentSession,
  childSessionsMap: Map<string, AgentSession>,
): tool
```

The factory captures the parent session at tool-creation time. No ambient globals, no module-level state, no context lookups.

### Child session lifecycle

```
Parent Session                        Child Session
     │                                     │
     ├─ tool-call-start("spawnSubAgent")   │
     │                                     │
     ├─ child-session-attached ──────────►  (records edge)
     │                                     │
     │                                     ├─ session-start
     │                                     ├─ text-delta ...
     │                                     ├─ tool-call-start/end ...
     │                                     └─ session-end
     │                                     │
     ├─ tool-call-end (result string)      │
     │                                     │
     │         Projection layer:           │
     │         reads child events via       │
     │         getChildEvents(sessionId)   │
     │         projects inline              │
```

### Session tree (future direction)

```
Root Session (main chat)
  ├── Researcher (child session)
  ├── Debugger (child session)
  │     └── Security Auditor (child of Debugger)
  └── Planner (child session)
```

Each node is the same `AgentSession` class. Each owns its own event log, bus, lifecycle, cancellation, and projections.

---

## 9. React Integration

### `useSyncExternalStore` pattern

```typescript
const liveEvents = useSyncExternalStore(
  // subscribe
  useCallback((cb) => {
    if (!activeSession) return () => {};
    return activeSession.subscribe(cb);
  }, [activeSession]),
  // getSnapshot
  useCallback(() => {
    if (!activeSession) return EMPTY_EVENTS;  // stable reference!
    return activeSession.getSnapshot();
  }, [activeSession]),
);
```

### Critical details

- **`EMPTY_EVENTS` constant**: prevents infinite loop when no session is active. Returning a new `[]` literal on every `getSnapshot()` call causes React to detect a "change" every render.
- **`useMemo` for display blocks**: `groupEventsForDisplay` is wrapped in `useMemo` keyed on `[displayEvents, projectOptions]` to avoid recomputation when inputs haven't changed.
- **Deduplication**: events from the active session's snapshot might overlap with persisted events. The `displayEvents` useMemo filters by event ID.

### Hook composition

```
useChatSender          ← creates session, fires streaming, returns session + childSessionsMap
useChatHistory         ← loads stored events, subscribes to active session, projects to DisplayBlocks
    useChat             ← composes both, threads childSessionsMap
useChatScreenState     ← sync sendMessage(), attaches session via attachSession()
```

### Terminal rendering (Ink `<Static>`)

The `ChatHistory` component uses Ink's `<Static>` to freeze completed blocks:

```
<Static items={frozenBlocks}>   ← all but last 3, rendered once, never updated
{liveBlocks.map(...)}           ← last 3 blocks, re-rendered on each event batch
```

This prevents Ink from rewriting the entire terminal buffer on every event. Frozen blocks are never re-touched; only the live tail updates dynamically.

---

## 10. Review Orchestrator

The PR review system creates its own `AgentSession` for the review orchestrator agent. Sub-agents spawned during the review are created via the same `createSpawnSubAgentTool` factory.

```typescript
// useReviewOrchestrator.ts
const session = new AgentSession();

const mainAgent = createAgent(reviewOrchestratorPrompt, {
  gitDiff: gitDiffTool,
  spawnSubAgent: createSpawnSubAgentTool(session, childSessions),
});

await streamAgentResponse(mainAgent, messages, session, signal);
```

The review screen still uses `subAgentBus` for real-time sub-agent updates (legacy compatibility). The `createSpawnSubAgentTool` factory forwards child session events to `subAgentBus` alongside the parent session's `child-session-attached` event.

---

## 11. Database Schema

### Tables

```sql
sessions (
  id          TEXT PRIMARY KEY,
  started_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  metadata    TEXT              -- JSON: { userInput }
);

agent_events (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL,
  sequence            INTEGER NOT NULL,
  type                TEXT NOT NULL,
  timestamp           TEXT NOT NULL,
  data                TEXT NOT NULL,    -- JSON payload
  parent_event_id     TEXT,             -- nesting (child sessions)
  related_tool_call_id TEXT             -- correlation (tool calls)
);

settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

error_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  message   TEXT NOT NULL,
  stack     TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

```sql
CREATE INDEX idx_agent_events_session
  ON agent_events(session_id, sequence);

CREATE INDEX idx_agent_events_parent
  ON agent_events(parent_event_id);
```

---

## 12. File Inventory

### Core Library (`src/lib/`)

| File | Purpose |
|---|---|
| `agentSession.ts` | `AgentSession` class: bus + log + lifecycle |
| `agentStream.ts` | `streamAgentResponse()`: iterates AI SDK stream, emits events |
| `eventTypes.ts` | `AgentEvent`, `Session`, `DisplayBlock`, `SubAgentDisplayState`, `SubAgentPart` |
| `eventPersistence.ts` | DB operations for sessions + events, `projectEventsToAIHistory()` |
| `projectEvents.ts` | `groupEventsForDisplay()`: pure projection from events to display blocks |
| `bus.ts` | Generic typed event bus factory (`createBus`) |
| `subAgentBus.ts` | Typed bus for review screen sub-agent events (compat layer) |

### Agent Layer (`src/agent/`)

| File | Purpose |
|---|---|
| `agent.ts` | `createAgent()`: factory for `ToolLoopAgent` with file tools |
| `prompt.ts` | System prompt builder |
| `review/spawnSubAgent.ts` | `createSpawnSubAgentTool()` factory for child session spawning |
| `review/reviewPrompt.ts` | System prompt for review orchestrator |
| `commands/registry.ts` | Slash commands (/help, /clear, /reset, /settings, /review) |

### UI Layer (`src/tui/hooks/`)

| File | Purpose |
|---|---|
| `useChatSender.ts` | Creates `AgentSession`, fires streaming, returns session + childSessionsMap |
| `useChatHistory.ts` | Loads persisted sessions, subscribes to active session via `useSyncExternalStore`, projects to DisplayBlocks |
| `useChat.ts` | Composes useChatSender + useChatHistory |
| `useChatScreenState.ts` | Orchestrates chat screen state, keyboard input, command handling |
| `useReviewOrchestrator.ts` | Creates review session, spawns sub-agents, drives review UI |
| `useManagedSubAgents.ts` | Manages sub-agent state array for review screen |
| `useSubAgentListener.ts` | Subscribes to subAgentBus for real-time updates |

### UI Layer (`src/tui/components/`)

| File | Purpose |
|---|---|
| `chat/ChatHistory.tsx` | Renders DisplayBlock[] with Ink `<Static>`+ live tail |
| `chat/UserMessage.tsx` | Renders user display block |
| `chat/AgentMessage.tsx` | Renders assistant display block with MarkdownRenderer |
| `chat/ToolMessage.tsx` | Renders tool-call display block |
| `review/SubAgentRow.tsx` | Renders sub-agent display block inline |
| `review/SubAgentDetail.tsx` | Expanded sub-agent detail view |
| `review/ReviewBlockList.tsx` | Review session block list |

---

## 13. Architectural Principles

### 1. Execution events are primary

UI messages are derived views. Events are the source of truth. Never let presentation concerns drive execution logic.

### 2. Event logs are canonical

The bus distributes live events. The log stores history. They serve different purposes and are designed differently.

### 3. Runtime and presentation must be separated

Execution should not decide UI grouping. The `currentId = null` hack (present in the old architecture) was a violation — it was presentation logic leaking into the streaming pipeline.

### 4. Projections should be pure

Deterministic, replayable, side-effect free. Same events → same display, always.

### 5. Sub-agents are runtime sessions

Not special-case tools. Same `AgentSession` class, same lifecycle. Parent linkage via `parentEventId`.

### 6. AI systems behave like streaming runtimes

Not traditional request/response chat apps. Design for continuous, nested, parallel execution from day one.

### 7. Session isolation

A session log contains only events originating from that session. Child events are never forwarded into parent logs. The projection bridges session boundaries at render time.

### 8. Explicit ownership boundaries

No ambient globals, no module-level context variables, no implicit session references. Parent sessions are injected into child session factories explicitly.
