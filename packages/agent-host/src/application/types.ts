import type {
  AgentMode,
  Session,
  SendOptions,
  Workspace,
} from "@excelsior/core";
import type { AgentRun } from "../runtime/agentRun.js";
import type { AnyAgentEvent } from "../runtime/events.js";
import type { ProjectedBlock } from "../projection/display.js";
import type { FileCheckpoint } from "../revert/fileCheckpoint.js";
import type { RunRecorder } from "../persistence/runRecorder.js";
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

export interface AgentApplicationOptions {
  sessionManager?: AgentSessionService;
  recorder?: RunRecorder;
  fileCheckpoint?: FileCheckpoint;
  turnLifecycle?: TurnLifecycleDependencies;
}

export type { SendOptions };

export interface AgentSessionService {
  getCurrentSessionId(): string | null;
  getWorkspaceId(): string;
  getWorkspace(): Workspace;
  ensureSession(title?: string, userInput?: string): string;
  createSession(title?: string): Session;
  switchSession(sessionId: string): void;
  deleteSession(sessionId: string): Promise<void>;
  renameSession(sessionId: string, title: string): void;
  listSessions(): Session[];
}

export interface ProjectionInputState {
  liveEvents: readonly AnyAgentEvent[];
  persistedEvents: AnyAgentEvent[];
  childRuns: Map<string, { getSnapshot(): readonly AnyAgentEvent[] }>;
}
