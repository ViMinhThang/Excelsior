# Excelsior Architecture

Excelsior is an Ink-based terminal AI coding assistant. The runtime is event-driven so streaming model output, tool calls, sub-agents, cancellation, and replay all use one ordered event log.

## Current Layers

```text
TUI
  ChatScreen + SettingsScreen
  hooks compose input, feature panels, confirmation, and AgentManager state

Features
  Slash commands and feature panels are registered through FeatureRegistry
  Each feature owns its command behavior, UI panel, and local helpers

Application
  AgentManager is the only UI-facing observable store
  ChatService prepares messages and agent tools
  startRun wires run context, recorder, cancellation, and sub-agent events

Runtime
  AgentRun owns run events and subscriptions
  RunOrchestrator streams an agent and records events through RunRecorder
  Sub-agent updates use a run-scoped SubAgentEventSink

Persistence
  SQLite stores session/workspace/settings metadata
  JSONL stores per-session runtime events
  RunRecorder is the persistence boundary for events and checkpoints
```

## Important Boundaries

- `AgentManager` owns UI-facing state and exposes snapshots through `useSyncExternalStore`.
- `SessionManager` is a plain session service; it has no listeners or React-facing store contract.
- `RunRecorder` owns event append, checkpoint append, raw event loading, checkpoint-safe loading, and deletion.
- `loadSessionEvents()` returns checkpoint-safe history. Use raw event loading only for debugging or tests.
- File tools resolve paths inside the workspace root before reading or writing.
- Sub-agents receive the parent `ToolContext`, so confirmations and cancellation are consistent across parent and child agents.

## Review Flow

PR review is currently command-driven. `/review <number>` fetches a diff, asks the agent to spawn focused sub-agents, and keeps all review output in the normal chat timeline.
