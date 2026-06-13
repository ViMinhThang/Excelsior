# Reflection Flow

This document explains how Excelsior's reflection feature turns recent sessions into durable workspace memory without giving the background worker access to normal project tools.

## Big Picture

Reflection is a separate harness run that reviews recent projected conversation history and writes concise markdown memory files under the harness data directory.

The important behaviors are:

- manual reflection starts with `/reflect`
- auto reflection is opt-in and runs only after enough session activity
- reflection uses the configured provider and model settings, but with a fixed tool-step cap
- the worker can only list, read, and write reflection memory markdown files
- reflection memory injection is controlled separately from auto reflection
- reflection state is projected to clients through `ReflectionClientState`
- successful runs record the last run time, summary, reviewed sessions, and touched memory files

The high-level path is:

```text
User runs /reflect or auto gate passes after a normal run
  -> ReflectionRunManager starts a background reflection run
  -> recent sessions are projected into aiHistory excerpts
  -> buildReflectionPrompt creates the worker prompt
  -> runAgentLoop runs with only memory tools
  -> ReflectionMemoryStore records markdown files and state.json metadata
  -> harness snapshot exposes updated reflection client state
```

## Main Components

The core implementation lives under:

```text
packages/agent-harness/src/reflection/
```

The main files are:

- `ReflectionRunManager.ts`: owns run lifecycle, auto gating, corpus construction, status, and success/failure recording
- `ReflectionMemoryStore.ts`: owns the memory root, `index.md`, `topics/`, and `state.json`
- `prompt.ts`: builds the background worker prompt
- `tools.ts`: registers the restricted reflection-only tools

The feature is wired into the harness in:

- `packages/agent-harness/src/harness.ts`
- `packages/agent-harness/src/commands.ts`
- `packages/agent-harness/src/storage.ts`
- `packages/core/src/clientState.ts`

## Commands

The slash command is registered as:

```text
/reflect [status|stop|on|off|memory on|memory off]
```

Command behavior:

- `/reflect` starts a manual reflection run
- `/reflect status` prints current status, auto setting, memory root, last run, last summary, and touched files
- `/reflect stop` aborts the active reflection run if one exists
- `/reflect on` enables auto reflection
- `/reflect off` disables auto reflection
- `/reflect memory on` includes reflection memory in future normal run context
- `/reflect memory off` excludes reflection memory from future normal run context

Auto reflection is off by default. The default comes from `DEFAULT_SETTINGS.autoReflectionEnabled` in `packages/agent-harness/src/storage.ts`.

Reflection memory context is also off by default. This is separate from auto reflection: auto reflection controls whether background reflection runs happen, while memory context controls whether existing reflection memory is appended to normal model runs.

## Manual Run Flow

Manual runs enter through `reflectCommand()` in `packages/agent-harness/src/commands.ts`.

```text
/reflect
  -> reflectCommand([])
  -> harness.startReflection("manual")
  -> ReflectionRunManager.startReflection("manual")
```

`startReflection()` rejects overlapping runs. If a reflection is already active, it returns:

```text
Reflection is already running. Use /reflect status or /reflect stop.
```

When a run starts, the manager:

- creates an `AbortController`
- sets status to `running`
- clears any previous failure summary
- starts `runReflection()` in the background
- calls `onChange()` so clients receive a new snapshot
- returns a command result with the memory root

The command does not wait for the worker to finish. Completion updates state asynchronously.

## Auto Run Flow

Auto reflection is checked after a normal, non-silent harness run finishes.

In `HarnessStore.send()`:

```text
normal agent run finishes
  -> active run is cleared
  -> sessions are refreshed
  -> clients are notified
  -> reflectionRun.maybeStartAutoReflection()
```

`maybeStartAutoReflection()` calls `canStartAutoReflection()`, which refreshes sessions and delegates to `shouldStartAutoReflection()`.

The auto gate passes only when:

- `autoReflectionEnabled` is true
- no reflection is currently running
- the last successful reflection was at least 24 hours ago, or there has never been a valid successful reflection
- at least 5 sessions have been updated since the last successful reflection

If there is no valid `lastReflectedAt`, every session counts as updated for the purpose of the 5-session threshold.

The constants are defined in `ReflectionRunManager.ts`:

```ts
const AUTO_REFLECTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AUTO_REFLECTION_MIN_UPDATED_SESSIONS = 5;
```

## Session Corpus

Reflection does not read raw session files directly into the prompt. It builds a compact corpus from projected AI history.

`buildSessionCorpus()`:

- refreshes the session list
- considers the 10 most recent sessions
- loads each session's events from storage
- projects events through `ProjectionCache`
- takes the projected `aiHistory`
- formats messages as `USER:`, `ASSISTANT:`, or the message role in uppercase
- clips each session block to 8,000 characters
- clips the total corpus to 30,000 characters

The relevant constants are:

```ts
const RECENT_SESSION_LIMIT = 10;
const PER_SESSION_CHAR_LIMIT = 8_000;
const TOTAL_CORPUS_CHAR_LIMIT = 30_000;
```

Each included session block has this shape:

```text
## <session title> (<session id>)
Updated: <session.updatedAt>

<projected message text>
```

When content is clipped, the manager appends:

```text
[truncated for reflection context]
```

## Worker Prompt

`buildReflectionPrompt()` creates a single user message for the background worker.

The prompt gives the worker:

- trigger type, either `manual` or `auto`
- generation timestamp
- memory root path
- recent session excerpts

It tells the worker to:

- inspect existing memory with `listMemory` and `readMemory`
- update `index.md` and focused topic files under `topics/`
- preserve durable facts, recurring user preferences, architectural decisions, unresolved threads, and useful working context
- include concrete dates for time-sensitive facts
- avoid secrets, access tokens, private credentials, and raw logs
- finish with a short human-readable summary

## Tool Sandbox

Reflection runs through the normal `runAgentLoop()`, but the tool registry is not the normal harness tool registry.

`createReflectionToolRegistry()` registers only:

- `listMemory`: list markdown files in the reflection memory root
- `readMemory`: read one markdown file from the memory root
- `writeMemory`: create or overwrite one markdown file in the memory root

The tool context also blocks normal interactive capabilities:

- confirmations always return denied
- questions always return cancelled
- sub-agent dispatch returns `Reflection runs cannot spawn sub-agents.`

The system prompt reinforces the boundary:

```text
You are Excelsior's private background reflection worker. Use only memory tools.
```

Reflection still uses the current harness settings and provider registry. The manager overrides `agentToolLoopSteps` to `12` for the reflection run:

```ts
const REFLECTION_TOOL_LOOP_STEPS = "12";
```

## Memory Layout

The memory root is workspace-specific:

```text
<harness data root>/memory/<workspace id>
```

`FileHarnessStorage.reflectionMemoryDirectory(workspaceId)` creates this directory.

`ReflectionMemoryStore` ensures the root contains:

```text
index.md
state.json
topics/
```

`index.md` is created with a short default heading when absent. `topics/` is where focused memory files are expected to live, though the store allows any markdown path under the memory root.

`state.json` stores:

```ts
interface ReflectionMemoryState {
  lastReflectedAt?: string;
  lastSummary?: string;
  touchedFiles: string[];
  reviewedSessionIds: string[];
}
```

The store validates memory file paths before read/write:

- paths must be relative
- paths cannot contain `..`
- paths must end in `.md`
- resolved paths must stay inside the memory root

## Memory In Normal Run Context

Normal agent runs always get one per-turn reflection-memory system message near the end of the message list, after prior transcript history and the current mode message, before the user message.

When reflection memory context is enabled, the message is:

```text
Reflection memory context: on.
Use the durable reflection memory below as background context when it is relevant.

<markdown memory corpus>
```

The corpus is built from markdown files in the reflection memory root. Each file is included as:

```text
## <relative memory file path>

<file content>
```

The memory corpus is capped before insertion so reflection memory cannot grow the run context without bound.

When reflection memory context is disabled, Excelsior still appends a fixed system message:

```text
Reflection memory context: off. Do not use stored reflection memory for this turn.
```

That explicit off message is intentional. If one turn had memory enabled and the next turn has memory disabled, the current context still tells the model that reflection memory is off instead of silently omitting the memory block.

## Success Recording

After `runAgentLoop()` completes, `runReflection()` checks captured events for an `ERROR` event.

If no error occurred and the run was not aborted, it records success:

```text
ReflectionMemoryStore.recordSuccess(...)
```

Success metadata includes:

- `reflectedAt`: current timestamp
- `summary`: the last assistant `MESSAGE_END` content, clipped to 1,000 characters
- `touchedFiles`: markdown files written through `writeMemory`
- `reviewedSessionIds`: session ids included in the corpus

The touched files and reviewed sessions are deduplicated and sorted before being written to `state.json`.

## Status And Client Projection

The client-facing state is:

```ts
export interface ReflectionClientState {
  status: "idle" | "running" | "failed";
  lastRunAt?: string;
  lastSummary?: string;
  touchedFiles: string[];
  memoryRoot: string;
}
```

`ReflectionRunManager.snapshot()` delegates to `ReflectionMemoryStore.snapshot()`, passing the in-memory status and any current failure summary.

The snapshot is included in `AgentClientState` and projected through `packages/agent-harness/src/projection.ts`.

Clients use this state to show reflection status:

- the TUI footer shows `reflecting | /reflect stop` while status is `running`
- the TUI footer shows `reflection failed` when status is `failed`
- the desktop chat panel shows a reflection status pill when reflection is running, failed, or has a last summary

## Cancellation And Failure

`/reflect stop` calls:

```text
harness.cancelReflection()
  -> ReflectionRunManager.cancelReflection()
```

Cancellation:

- aborts the active reflection run signal
- sets status back to `idle`
- clears the failure summary
- notifies clients

When the background promise settles, the manager clears `currentRun`. If the status is still `running`, it resets it to `idle`.

Failure can happen in two places:

- an exception escapes `runReflection()`
- `runAgentLoop()` emits an `ERROR` event

In both cases, status becomes `failed` and `failedSummary` is exposed as `lastSummary` in the client snapshot. A failed run does not call `recordSuccess()`, so `lastReflectedAt` in `state.json` is not advanced.

## Important Boundaries

Reflection memory is private harness memory, not project source.

The worker receives recent conversation excerpts and can write markdown only under the reflection memory root. It cannot edit workspace files through normal filesystem tools, ask the user questions, approve actions, or launch sub-agents. This makes reflection suitable for durable working context while keeping it separate from the repo and from normal agent execution.
