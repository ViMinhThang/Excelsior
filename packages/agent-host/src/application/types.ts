import type {
  AgentMode,
  Session,
  SendOptions,
  Workspace,
  ProjectedBlock,
} from "@excelsior/core";
import type { AgentRun } from "../runtime/agentRun.js";
import type { AnyAgentEvent } from "../runtime/events.js";
import type { RunRecorder } from "../persistence/runRecorder.js";
import type { AgentSessionStorage } from "./sessions/SessionStorage.js";
import type { TurnLifecycleDependencies } from "./turns/TurnLifecycle.js";
import type { TurnTransactionCoordinator } from "./turns/TurnTransaction.js";

export interface ChatSessionState {
  displayBlocks: ProjectedBlock[];
  isLoading: boolean;
  sessions: Session[];
  activeRun: AgentRun | null;
  currentSessionId: string | null;
  workspace: Workspace;
  mode: AgentMode;
}

export interface AgentApplicationOptions {
  sessionStorage?: AgentSessionStorage;
  recorder?: RunRecorder;
  turnTransactions?: TurnTransactionCoordinator;
  turnLifecycle?: TurnLifecycleDependencies;
}

export type { SendOptions };

export interface ProjectionInputState {
  liveEvents: readonly AnyAgentEvent[];
  persistedEvents: AnyAgentEvent[];
  childRuns: Map<string, { getSnapshot(): readonly AnyAgentEvent[] }>;
}
