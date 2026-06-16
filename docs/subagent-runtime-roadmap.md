# Subagent Runtime Roadmap

This document describes how Excelsior can grow subagents from a focused inline tool into a fuller runtime that can support durable background work, richer UI state, cancellation, retries, and future worker processes.

It is intentionally forward-looking. For the current implementation of the built-in `spawnSubAgent` tool, see `docs/subagent-tool-flow.md`.

## Goal

Subagents should become first-class task actors.

Today, a spawned subagent is mostly a tool call with streamed child progress. That is enough for focused read-only investigations, but it is too narrow for future features such as:

- background analysis while the parent chat continues
- multiple concurrent agents
- pausing, cancelling, and retrying individual child tasks
- reopening completed subagent transcripts
- durable recovery after app restart
- permission-scoped workers
- specialized agent roles such as reviewer, debugger, test runner, or frontend QA

The target design is to separate three concerns:

1. The parent agent requests useful work.
2. The subagent runtime schedules and executes that work.
3. Clients project subagent state into a TUI or desktop presentation.

## Current Shape

The current flow is:

```text
Parent model calls spawnSubAgent
  -> harness tool starts a child runner
  -> child emits progress lines
  -> parent converts progress into SUB_AGENT_EVENT events
  -> projector updates a sub-agent transcript block
  -> child exits
  -> parent receives final tool result
```

This is a good seed because it already has:

- a parent-visible tool boundary
- a child execution context
- progress events
- projected subagent blocks
- a TUI picker/detail mode

The limitation is that the subagent lifetime is still tied to one parent tool call. If the parent turn ends, the useful concept of "the child task" mostly disappears into projected transcript state.

## Target Concepts

### Subagent Definition

A subagent definition describes a role that can be launched.

```ts
export interface SubAgentDefinition {
  id: string;
  label: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  permissions: SubAgentPermissions;
  defaultMode: "plan" | "act";
  concurrency: "single" | "parallel";
}

export interface SubAgentPermissions {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canRunCommands: boolean;
  canUseNetwork: boolean;
  requiresApprovalForWrites: boolean;
}
```

Examples:

| Role | Purpose | Default Permissions |
|---|---|---|
| `researcher` | Inspect code and summarize findings | read-only |
| `reviewer` | Find risks, bugs, and missing tests | read-only |
| `diagnoser` | Reproduce and isolate a bug | read + approved commands |
| `test-runner` | Run targeted checks and report failures | read + approved commands |
| `implementer` | Make scoped code changes | write with approval |
| `frontend-qa` | Verify UI behavior and screenshots | read + browser/computer tools |

Definitions should live near the harness, not inside a client, because clients should render roles but not own their runtime policy.

### Subagent Run

A subagent run is one launched instance of a definition.

```ts
export interface SubAgentRun {
  id: string;
  sessionId: string;
  parentRunId: string;
  parentTurnId: string;
  parentToolCallId?: string;
  definitionId: string;
  title: string;
  objective: string;
  status: SubAgentRunStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  error?: string;
  progress?: SubAgentProgress;
}

export type SubAgentRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export interface SubAgentProgress {
  currentStep?: string;
  completedSteps?: number;
  totalSteps?: number;
}
```

This object is the durable identity that clients can list, select, cancel, retry, and reopen.

### Subagent Event Log

The runtime should emit events instead of mutating UI state directly.

```ts
export type SubAgentRuntimeEvent =
  | { type: "subagent.created"; run: SubAgentRun }
  | { type: "subagent.started"; runId: string; startedAt: string }
  | { type: "subagent.progress"; runId: string; progress: SubAgentProgress }
  | { type: "subagent.message"; runId: string; block: ProjectedBlock }
  | { type: "subagent.tool.started"; runId: string; toolCallId: string; name: string }
  | { type: "subagent.tool.completed"; runId: string; toolCallId: string; result: string }
  | { type: "subagent.waiting"; runId: string; reason: string }
  | { type: "subagent.completed"; runId: string; completedAt: string; summary: string }
  | { type: "subagent.failed"; runId: string; completedAt: string; error: string }
  | { type: "subagent.cancelled"; runId: string; completedAt: string; reason?: string };
```

The projector can derive:

- the transcript block in the parent conversation
- the subagent list shown in the TUI
- the detail view for one subagent
- footer badges such as `agents: 2 running`
- durable session history after restart

## Runtime Interface

The parent harness should depend on a runner interface instead of hardcoding process details.

```ts
export interface SubAgentRunner {
  start(input: StartSubAgentInput): Promise<SubAgentRun>;
  cancel(runId: string): Promise<void>;
  retry(runId: string): Promise<SubAgentRun>;
  getRun(runId: string): Promise<SubAgentRun | null>;
  listRuns(sessionId: string): Promise<SubAgentRun[]>;
}

export interface StartSubAgentInput {
  sessionId: string;
  parentRunId: string;
  parentTurnId: string;
  parentToolCallId?: string;
  definitionId: string;
  title: string;
  objective: string;
  mode?: "plan" | "act";
}
```

The first implementation can remain in-process or child-process based. The important part is that the rest of the harness talks to `SubAgentRunner`, not to a specific worker mechanism.

## Background Execution

Background support means a subagent can outlive the immediate parent model step.

The future flow should look like:

```text
Parent starts subagent
  -> SubAgentScheduler creates durable run
  -> event store records subagent.created
  -> scheduler starts or queues work
  -> parent receives a run id immediately or waits for a final result depending on mode
  -> clients keep receiving projected state updates
  -> parent chat can continue while subagent remains running
  -> completion emits summary and optional notification
```

There are two useful launch modes:

| Mode | Behavior | Use Case |
|---|---|---|
| `attached` | Parent waits for the final result before continuing | focused investigation needed now |
| `background` | Parent receives run id and continues | long tests, broad review, indexing, deep search |

The current `spawnSubAgent` maps to `attached`.

Future commands could expose background work explicitly:

```text
/agents
/agent run reviewer "review the auth flow"
/agent cancel subagent_123
/agent retry subagent_123
```

## Scheduler

A scheduler owns queueing and concurrency.

Responsibilities:

- create run ids
- enforce per-role concurrency
- enforce workspace-wide concurrency
- attach cancellation signals
- restart recoverable queued work after app restart
- mark interrupted work as failed or waiting
- publish runtime events

Suggested shape:

```ts
export interface SubAgentScheduler {
  enqueue(input: StartSubAgentInput): Promise<SubAgentRun>;
  cancel(runId: string): Promise<void>;
  resumeQueued(sessionId: string): Promise<void>;
}
```

Initial policy can be conservative:

- one writing subagent at a time
- many read-only subagents allowed
- parent run has priority over background work
- cancelled parent run cancels attached children
- cancelled parent run does not automatically cancel background children unless configured

## Worker Boundary

The system should be ready to move execution out of the main process.

Possible worker transports:

| Transport | Pros | Cons |
|---|---|---|
| In-process async runner | easiest to build | less isolation |
| Child process over stdio JSON lines | simple isolation, matches current child runner | custom protocol |
| SQLite-backed job queue | durable and restartable | more schema work |
| Local RPC server | good for multiple clients | more operational surface |

Recommended path:

1. Keep the current child-process runner.
2. Wrap it behind `SubAgentRunner`.
3. Persist `SubAgentRun` records and events.
4. Add queued/background status without changing the worker transport.
5. Only then consider a stronger queue or RPC layer.

## Projection Model

The parent transcript should show a compact summary block, not every detail by default.

Suggested parent block shape:

```ts
export interface ProjectedSubAgentBlock {
  type: "sub-agent";
  runId: string;
  role: string;
  title: string;
  status: SubAgentRunStatus;
  summary?: string;
  progress?: SubAgentProgress;
  toolCalls: ProjectedToolCall[];
  preview: ProjectedBlock[];
}
```

The detail view can load the full subagent transcript by `runId`.

This avoids stuffing the parent conversation with all child output while still making the work inspectable.

## TUI Behavior

The TUI should support three levels of subagent visibility.

### Main Chat

In the transcript:

```text
Subagent: reviewer
Status: running
Step: checking command approval flow
Tools: 3
```

Completed:

```text
Subagent: reviewer
Status: completed
Summary: Found 2 risks around confirmation queue ordering.
```

### Picker

The picker should list active and recent subagents:

```text
Subagents
> reviewer       running     checking confirmation queue
  test-runner    completed   npm run typecheck
  researcher     failed      missing docs/adr folder
```

Useful actions:

- Enter: open detail
- Esc: return to chat
- `c`: cancel selected running subagent
- `r`: retry failed subagent

### Detail View

The detail view should show:

- title and objective
- status
- progress
- child transcript
- tool calls
- final summary or error

It should be useful even after the parent run is complete.

## Desktop Behavior

Desktop should consume the same projected state as TUI.

Possible presentation:

- sidebar section for running agents
- expandable subagent transcript inside the main chat
- notification when background work completes
- action menu for cancel/retry/open

Desktop should not invent a different subagent model. It should render the same `SubAgentRun` and projected event state.

## Permissions

Subagents need explicit permission scopes because background work changes the risk profile.

Rules:

- read-only subagents can run concurrently by default
- writing subagents require approval unless the workspace setting allows trusted writes
- command-running subagents should use the same confirmation router as parent runs
- background subagents should never inherit hidden authority from the parent silently
- permission prompts should identify the subagent role and objective

Prompt example:

```text
reviewer wants to run:
npm test -- auth

Objective:
Review auth flow regression risk.
```

This keeps approvals understandable when multiple agents are alive.

## Cancellation

Cancellation should distinguish parent and child lifetimes.

| Situation | Expected Behavior |
|---|---|
| Cancel attached parent run | cancel attached subagents |
| Cancel background subagent | only that subagent stops |
| Cancel all | parent and all active subagents stop |
| App exits | running subagents are marked interrupted unless resumable |

The event log should record cancellation explicitly so projection does not leave dangling running states.

## Retry

Retry should create a new run id that references the previous run.

```ts
export interface SubAgentRun {
  id: string;
  retryOfRunId?: string;
  // ...
}
```

This preserves history and avoids mutating a completed or failed run into a different execution.

## Storage

Minimum durable storage:

- subagent run metadata
- subagent runtime events
- final summary/error
- parent run/session correlation

Storage can start inside the existing harness event store if that is easiest. If subagent events become noisy, they can move to a dedicated table or file while projection still consumes a unified event stream.

## Migration Plan

### Phase 1: Name The Model

- Add `SubAgentRun`, `SubAgentRunStatus`, and `SubAgentProgress` to shared contracts.
- Keep current execution behavior.
- Project existing `SUB_AGENT_EVENT` data through the new model where possible.

### Phase 2: Runner Interface

- Introduce `SubAgentRunner`.
- Move current child-process launching behind that interface.
- Keep `spawnSubAgent` attached by default.

### Phase 3: Durable Runs

- Persist run metadata.
- Add list/get APIs to the harness host contract.
- Let TUI reopen completed subagent details by run id.

### Phase 4: Background Mode

- Add scheduler queue.
- Add background launch mode.
- Add footer/picker indicators for running background agents.
- Add cancel action for a selected subagent.

### Phase 5: Worker Isolation

- Move long-running agents to a worker boundary if the in-process design becomes limiting.
- Keep the public runner interface stable.

## Open Questions

- Should background subagents continue after the parent session changes?
- Should a background subagent be allowed to write files without the parent run being active?
- Should subagent transcripts be visible to the parent model automatically, or only summarized?
- What is the default maximum number of concurrent read-only agents?
- Should failed background agents notify the parent chat, the footer, or both?
- Should a subagent be able to spawn another subagent?

## Recommended Next Step

Do not start with workers.

Start by adding the durable concepts:

1. `SubAgentRun`
2. `SubAgentRunner`
3. event-backed projection
4. TUI list/detail behavior keyed by `runId`

That gives the project a clean path to background execution without committing early to a heavy process architecture.
