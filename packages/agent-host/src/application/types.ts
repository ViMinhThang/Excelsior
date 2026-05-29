import type {
  AgentMode,
  Session,
  SendOptions,
  Workspace,
  ProjectedBlock,
} from "@excelsior/core";
import type { AgentRun } from "../runtime/agentRun.js";
import type { AnyAgentEvent } from "../runtime/events.js";
import type { RunRecorder, StorageEngine } from "@excelsior/agent-storage";
import type { AgentSessionStorage } from "../sessionManager.js";
import type { TurnLifecycleDependencies } from "./turns/TurnLifecycle.js";

export interface ChatSessionState {
  displayBlocks: ProjectedBlock[];
  isLoading: boolean;
  sessions: Session[];
  activeRun: AgentRun | null;
  currentSessionId: string | null;
  workspace: Workspace;
  mode: AgentMode;
}

import type {
  ConfirmPromptBus,
  QuestionPromptBus,
} from "../runtime/blockingPrompt.js";

export interface AgentApplicationOptions {
  sessionStorage?: AgentSessionStorage;
  recorder?: RunRecorder;
  storageEngine?: StorageEngine;
  turnLifecycle?: TurnLifecycleDependencies;
  confirmBus?: ConfirmPromptBus;
  questionBus?: QuestionPromptBus;
}

export type { SendOptions };

export interface ProjectionInputState {
  liveEvents: readonly AnyAgentEvent[];
  persistedEvents: AnyAgentEvent[];
  childRuns: Map<string, { getSnapshot(): readonly AnyAgentEvent[] }>;
}
