# Excelsior Architecture Overview

This document is a top-down map of the project. It shows how the packages relate, what each layer owns, and how the existing flow documents fit together.

## Who This Is For

New contributors who want to understand the project shape before reading individual flow docs. If you already know a specific area, skip to the flow docs directly.

## Module Dependency Graph

```text
        @excelsior/core    (shared contracts, presentation models)
              |
        @excelsior/client  (client-facing host interface)
              |
     @excelsior/agent-harness  (runtime, state, projection)
              |
        @excelsior/agent-host  (thin adapter layer)
             / \
            /   \
    @excelsior/tui   @excelsior/desktop
   (terminal client)   (Electron client)
```

### Layer Rules

1. `@excelsior/core` has zero internal dependencies. It defines data contracts, presentation models, and shared types used by every other layer.
2. `@excelsior/client` depends only on `core`. It defines the `AgentHost` interface and the `AgentHostClient` wrapper that clients use.
3. `@excelsior/agent-harness` depends on `core` plus the AI SDK. It owns all runtime state, event storage, projection, session management, tools, and run execution. It does NOT depend on `client`.
4. `@excelsior/agent-host` depends on `core`, `client`, and `agent-harness`. It is a thin adapter that wires a `HarnessAgentHost` from harness internals and exposes it through the `AgentHost` interface.
5. `@excelsior/tui` and `@excelsior/desktop` are consumers. They depend on `core`, `client`, and `agent-host` to get a wired-up host.

## What Each Package Contains

### @excelsior/core

Shared data contracts and presentation logic. No runtime behavior.

Key files and directories:

| Area | Path |
|---|---|
| Projected block types | `src/projection.ts` |
| Client-facing snapshot | `src/clientState.ts` |
| Confirmation contract | `src/confirmation.ts` |
| Question contract | `src/question.ts` |
| Tool display model | `src/conversationPresentation/toolDisplayRegistry.ts` |
| File-change preview | `src/conversationPresentation/fileChangePreview.ts` |
| Turn cancel gesture | `src/turnCancelGesture.ts` |

### @excelsior/client

The contract between app clients and the host. Does not know about harness internals.

| Area | Path |
|---|---|
| Host intent contract | `src/hostContract.ts` |
| Client wrapper | `src/hostActions.ts` |
| State types | re-exports from `core` |

### @excelsior/agent-harness

The engine. Owns all mutable state, event persistence, projection, tool execution, and the run loop.

| Area | Path |
|---|---|
| Main harness store | `src/harness.ts` |
| Event bus and store | `src/EventBus.ts`, `src/EventStore.ts` |
| Projection (events -> blocks) | `src/projection.ts`, `src/projector/` |
| Session management | `src/session/SessionManager.ts` |
| Settings store | `src/settings/SettingsStore.ts` |
| Tool registry | `src/registries.ts` |
| Built-in tools | `src/tools/` |
| Run execution | `src/run/RunController.ts`, `src/run/runModelStep.ts` |
| Active run tracking | `src/run/ActiveRunManager.ts` |
| Confirmation routing | `src/ConfirmationRouter.ts` |
| Skill system | `src/skills/` |
| Command registry | `src/commands.ts` |
| Sub-agent child runner | `src/subagentProcess.ts`, `src/subagentChildRunner.ts` |

### @excelsior/agent-host

Wires harness internals to the client-facing interface. Thin by design.

| Area | Path |
|---|---|
| HarnessAgentHost | `src/host/HarnessAgentHost.ts` |
| Default host factory | `src/host/defaultHost.ts` |

### @excelsior/tui

Terminal UI using OpenTUI/React.

| Area | Path |
|---|---|
| App entry, provider tree | `src/app.tsx`, `src/context/` |
| Chat screen and hooks | `src/screens/ChatScreen.tsx`, `src/hooks/` |
| Block renderers | `src/components/chat/ChatHistory.tsx` + leaf components |
| Sub-agent UI | `src/components/subAgents/` |
| Chat modes (input, picker, detail) | `src/chatModes/` |
| Keymap system | `src/lib/keymapRegistry.ts`, `src/hooks/useKeymap.ts` |
| Text input | `src/components/chat/SafeTextInput.tsx` |

### @excelsior/desktop

Electron-based desktop UI. Shares the same host contract as the TUI.

| Area | Path |
|---|---|
| Main process | `src/main/main.ts`, `src/main/workspaceHost.ts` |
| Renderer | `src/renderer/` |
| IPC bridge | `src/main/preload.ts` |

## How The Layers Connect At Runtime

### Startup

```text
Client (TUI/Desktop) starts
  -> imports getDefaultAgentHost() from @excelsior/agent-host
  -> HarnessAgentHost constructor creates:
       HarnessStore (from @excelsior/agent-harness)
         -> EventStore, SessionManager, SettingsStore
         -> ToolRegistry (built-in tools)
         -> SkillCatalog.discover() -> SkillsManager
         -> ActiveRunManager, ConfirmationRouter, RunController
  -> AgentHostClient wraps the host
  -> Client subscribes to host state via useSyncExternalStore
```

### Send Flow

```text
User types message -> harness.send()
  1. ActiveRunManager checks for existing run
  2. buildRunAssembly() creates run context, system prompt, tool context
  3. EventBus emits user message event
  4. RunController.run() loops:
       a. runModelStep() calls streamText() with AI SDK
       b. RunStepRecorder/RunEventWriter translate SDK parts into harness events
       c. Events go through EventBus -> EventStore -> projection -> snapshot
       d. Client sees updated snapshot, rerenders
  5. Run completes -> activeRun.finish() -> final snapshot
```

See `docs/tui-send-flow.md` and `docs/active-run-flow.md` for full detail.

### Projection Flow (Events -> UI Blocks)

```text
Event emitted
  -> EventStore.recordEvent()
  -> harness.updateSnapshot()
  -> ProjectionCache.project(events)
  -> Projector replays events through handlers
  -> MessageHandler, ToolHandler, LifecycleHandler, SubAgentHandler
  -> Each handler calls TranscriptProjection actions
  -> TurnStore (finalized blocks) + LiveDrafts (streaming blocks)
  -> snapshot() returns ProjectedTurn[]
  -> Client renders turns as chat blocks
```

See `docs/projection-flow.md` and `docs/tui-block-render-flow.md`.

## Relationship Between Flow Documents

Each flow doc in `docs/` covers one mechanism end to end across layers.

| Document | Covers | Key Layers |
|---|---|---|
| `active-run-flow.md` | Run lifecycle, steering, cancellation | harness (ActiveRunManager, RunController) |
| `tui-send-flow.md` | User message from input to model step | TUI -> client -> host -> harness |
| `projection-flow.md` | Events to transcript blocks | harness (Projector, TranscriptProjection) |
| `tui-block-render-flow.md` | Blocks to terminal output | TUI (ChatHistory, leaf components) |
| `confirmation-flow.md` | Tool confirmations, Plan mode blocking | harness (tools, ConfirmationRouter) + client + TUI/Desktop |
| `askquestion-tool-flow.md` | `askQuestion` tool end to end | harness (tools/interaction, ConfirmationRouter) + client + TUI/Desktop |
| `subagent-tool-flow.md` | `spawnSubAgent` child process | harness (tools/subAgent, subagentProcess, SubAgentHandler) + projection |
| `subagent-runtime-roadmap.md` | Future first-class subagent runs and background execution | harness runtime contracts + scheduler + TUI/Desktop projection |
| `revert-turn-flow.md` | `/revert` command and file backups | harness (revert.ts, fs.ts backups) + TUI commands |
| `skills-flow.md` | Skill discovery, tool/command registration | harness (SkillCatalog, SkillsManager, register.ts) |
| `tui-keybindings-flow.md` | Keyboard input, keymap priority, text editing | TUI (keymapRegistry, useKeymap, SafeTextInput) |

## State Architecture

There are three kinds of state in the harness:

1. **Canonical events**: the append-only `EventStore`. This is the source of truth. Every user message, assistant text delta, tool execution, turn boundary, and lifecycle event is a stored event.

2. **Projected read model**: derived from events by `Projector`. Contains `ProjectedTurn[]` (for the UI) and `AiHistory` (for the model). Disposable — replaying events from scratch produces the same output.

3. **Live harness state**: not derived from events. Includes:
   - `isLoading` (active run handle exists?)
   - `pendingConfirmation` / `pendingQuestion` (live UI prompts)
   - `sessions`, `mode`, workspace info

The `HarnessSnapshot` combines all three for clients.

## Key Design Decisions

**Events are the source of truth.** Projection is disposable. This makes session replay, debugging, and future features (undo, branching) tractable.

**Client does not know about the harness.** `@excelsior/client` defines only the `AgentHost` interface. The harness is an implementation detail behind `@excelsior/agent-host`.

**Streaming blocks use LiveDrafts.** Finalized blocks live in TurnStore. Active streaming overlays are in LiveDrafts. `snapshot()` combines both, so the UI renders streaming output without mutating finalized state.

**Confirmations and questions are not projected transcript blocks.** They are side-channel state on the snapshot. The events are stored for audit, but the UI prompt comes from `pendingConfirmation`/`pendingQuestion`.

**Sub-agent progress is display-only.** The parent model receives only the final tool result. Child tool calls and text deltas are UI-only progress through `sub_agent_event` events.

## Reading Guide

If you are new, read in this order:

1. **architecture-overview.md** (this file) — get the lay of the land
2. **projection-flow.md** — understand how events become transcript blocks
3. **tui-send-flow.md** — follow one user message through all layers
4. **active-run-flow.md** — understand run lifecycle and cancellation
5. **confirmation-flow.md** — understand tool safety gates
6. **skills-flow.md** — understand the skill system
7. Then the remaining flow docs as needed for your area

If you are expanding subagents beyond the current `spawnSubAgent` tool, read `subagent-runtime-roadmap.md` before changing runtime or UI contracts.
