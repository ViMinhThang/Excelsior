````md
# Event Architecture vs Append-Only Chat Architecture

## Why This Document Exists

When building an AI chat application, the simplest architecture is usually:

```text
User message
  → stream assistant text
  → append to UI
  → save final text
```
````

This works well for:

- simple chatbots
- basic assistants
- single-agent conversations
- non-streaming UIs

However, once the system evolves into an **agent runtime** with:

- tools
- streaming
- subagents
- concurrent tasks
- reasoning traces
- interruption/resume
- replay
- terminal-style interaction

the "append text to a message" model begins to break down.

This document explains:

1. what append-chat architecture is
2. what event architecture is
3. what problems event architecture solves
4. when event architecture is worth the complexity
5. the recommended hybrid approach

---

# 1. Append-Only Chat Architecture

## Model

The system stores finalized chat messages.

Example:

```sql
messages
- id
- session_id
- role
- content
- created_at
```

Streaming is handled in memory:

```ts
let assistantText = "";

stream.on("delta", (chunk) => {
  assistantText += chunk;
  ui.render(assistantText);
});

stream.on("done", () => {
  saveMessage(assistantText);
});
```

## Strengths

### Very simple

Easy to reason about.

### Cheap to store

Only finalized messages are persisted.

### Easy querying

```sql
SELECT * FROM messages ORDER BY created_at;
```

### Good enough for:

- ChatGPT-style chat
- FAQ bots
- small assistants
- lightweight tools

---

# 2. Problems With Append-Only Architecture

The architecture becomes difficult once execution becomes dynamic.

---

## Problem A — Tool Streaming

Suppose an agent runs:

```bash
grep -R "TODO" src/
```

The tool streams output progressively.

With append-chat architecture:

```ts
message += stdoutChunk;
```

You lose:

- boundaries
- lifecycle
- timing
- ordering
- interruption state

You cannot reliably know:

- when the tool started
- whether it completed
- whether output was partial
- whether stderr occurred
- whether the user cancelled

---

## Problem B — Interleaving Streams

Suppose:

- assistant text streams
- tool stdout streams
- reasoning streams
- subagent streams

all simultaneously.

Example:

```text
Assistant: "Searching..."
Tool: "src/a.ts"
Assistant: "Found results"
Tool: "src/b.ts"
```

If everything appends to strings:

- ordering becomes implicit
- rendering becomes timing-dependent
- concurrency becomes fragile

The UI may behave differently depending on:

- async scheduling
- buffering
- render timing

---

## Problem C — Crash Recovery

Suppose the app crashes during:

- a running tool
- a streaming response
- a long reasoning block

If only finalized messages are stored:

- all in-memory progress is lost

The system cannot reconstruct:

- partial progress
- active tools
- reasoning state
- streaming state

---

## Problem D — Replayability

Append-only chat stores results.

It does NOT store execution.

You can read:

> "Tool completed successfully"

But you cannot replay:

- stdout stream
- stderr stream
- intermediate progress
- cancellation
- retries

This makes debugging agent systems difficult.

---

## Problem E — UI State Explosion

Without explicit runtime events, state becomes scattered:

```ts
if (toolRunning) ...
if (reasoningVisible) ...
if (subagentActive) ...
if (assistantStreaming) ...
```

Eventually the UI becomes a collection of loosely-related flags.

The runtime model becomes implicit instead of explicit.

---

# 3. Event Architecture

## Model

Instead of storing only finalized messages, the runtime emits explicit events.

Example:

```text
run-start
assistant-delta
assistant-delta
tool-call-start
tool-stdout-delta
tool-stdout-delta
tool-call-end
assistant-delta
run-end
```

Each event is:

- ordered
- typed
- replayable
- append-only

---

# 4. What Event Architecture Solves

## A. Explicit Lifecycle

Instead of implicit state:

```ts
isToolRunning = true;
```

you have:

```text
tool-call-start
tool-call-end
```

The lifecycle becomes observable.

---

## B. Deterministic Replay

The system can reconstruct state from events:

```text
events
   ↓
projection
   ↓
UI state
```

This allows:

- crash recovery
- session restore
- debugging
- time-travel inspection

---

## C. Concurrent Streams

Events preserve ordering:

```text
#1 assistant-delta
#2 tool-delta
#3 assistant-delta
```

The UI becomes deterministic.

---

## D. Progressive Rendering

The UI can react incrementally:

- stream text
- stream reasoning
- stream tool output
- show progress bars
- show live subagent state

without waiting for completion.

---

## E. Better Runtime Boundaries

Instead of:

- hidden mutable state
- giant UI conditionals
- ad hoc flags

you get:

- runtime events
- projections
- derived state

The architecture scales more cleanly.

---

# 5. Important Misunderstanding

## Event Architecture ≠ Store Every Token Forever

This is the most common mistake.

A good event system usually separates:

| Runtime Events     | Durable History  |
| ------------------ | ---------------- |
| granular           | compact          |
| transient          | persistent       |
| execution-oriented | context-oriented |
| replayable         | readable         |

You do NOT need:

- 1 DB row per token
- permanent storage of every chunk

---

# 6. Recommended Hybrid Architecture

This is the architecture used by systems like:

- OpenAI Codex
- Claude Code
- advanced agent runtimes

---

## Runtime Layer

Use events for:

- streaming
- tools
- reasoning
- subagents
- orchestration
- replay

Example:

```text
assistant-delta
tool-call-start
tool-stdout-delta
reasoning-delta
tool-call-end
```

These power the live runtime.

---

## Projection Layer

Convert runtime events into UI state.

Example:

```text
events
   ↓
projection
   ↓
display blocks
```

This keeps rendering deterministic.

---

## Persistence Layer

Persist compact finalized history.

Instead of storing:

- every token
- every stdout chunk

store:

- finalized assistant messages
- finalized reasoning summaries
- finalized tool blocks

Example:

```sql
conversation_items
- id
- session_id
- run_id
- type
- content
- metadata
```

---

# 7. When Event Architecture Is Worth It

## Use Append-Only Chat If You Have

- simple chatbot
- no tools
- no subagents
- minimal streaming
- no replay/resume
- no long-running tasks

---

## Use Event Architecture If You Have

- tool execution
- streaming stdout/stderr
- concurrent agents
- resumability
- crash recovery
- progressive UI
- reasoning streams
- timeline replay
- long-running coding agents

---

# 8. Final Recommendation

For an AI coding runtime:

## Keep event architecture for runtime execution

because:

- tools
- reasoning
- subagents
- replay
- streaming

all benefit heavily from explicit events.

## Do NOT permanently store every tiny event

Instead:

- stream granular events during execution
- project them into UI state
- compact finalized output into durable history

This gives:

- runtime power
- scalable persistence
- simpler querying
- smaller databases
- cleaner architecture

without losing replayability or streaming behavior.

```

```
