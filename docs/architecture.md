# Excelsior Architecture

Excelsior is an Ink-based terminal AI coding assistant. The runtime is event-driven so streaming model output, tool calls, sub-agents, cancellation, and replay all use one ordered event log.

## Current Packages

```text
@excelsior/core
  Serializable UI/backend contracts, shared domain models, view types, modes, commands, panels

@excelsior/agent-host
  Local backend facade for agent state, commands, settings, sessions, confirmations
  Owns AgentManager, ChatService, run wiring, runtime, persistence, GitHub helpers, tools

@excelsior/tui
  Ink App, screens, hooks, components, navigation, and UI feature panels
```

## Important Boundaries

- Apps consume package exports; packages do not import implementation from root `src`.
- `@excelsior/core` has no React, Ink, persistence, GitHub, filesystem, or model SDK dependencies.
- `AgentHost` is the TUI-facing contract. `LocalAgentHost` adapts backend state to serializable `AgentClientState`.
- Workspace identity crosses the client boundary as `state.workspace`, with `rootPath` grouped under that domain object.
- `AgentManager` owns UI-facing state inside `@excelsior/agent-host` and exposes snapshots through `useSyncExternalStore`.
- `SessionManager` is a plain session service; it has no listeners or React-facing store contract.
- `RunRecorder` owns event append, checkpoint append, raw event loading, checkpoint-safe loading, and deletion.
- `loadSessionEvents()` returns checkpoint-safe history. Use raw event loading only for debugging or tests.
- File tools resolve paths inside the workspace root before reading or writing.
- Sub-agents receive the parent `ToolContext`, so confirmations and cancellation are consistent across parent and child agents.
- Slash commands are registered as backend command entries with definitions and handlers. Review commands receive injectable GitHub services for tests.

## Review Flow

PR review is currently command-driven. `/review <number>` fetches a diff, asks the agent to spawn focused sub-agents, and keeps all review output in the normal chat timeline.
