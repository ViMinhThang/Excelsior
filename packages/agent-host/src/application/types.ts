import type {
  AgentMessage,
  AgentMode,
  Session,
  SendOptions,
  Workspace,
} from "@excelsior/core";
import type { RunHandle } from "@excelsior/run-runtime";
import type { AgentRun } from "../lib/runtime/agentRun.js";
import type {
  AgentEventDataMap,
  AnyAgentEvent,
} from "../lib/runtime/events.js";
import type { ProjectedBlock } from "../lib/projection/display.js";
import type { SubAgentEventSink } from "../lib/runtime/subAgentEventSink.js";
import type { FileCheckpoint } from "../lib/revert/fileCheckpoint.js";
import type { SessionHistoryStore } from "./history/SessionHistoryStore.js";

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
  chatService?: ChatTurnService;
  sessionManager?: AgentSessionService;
  historyStore?: SessionHistoryStore;
  fileCheckpoint?: FileCheckpoint;
}

export type { SendOptions };

export interface TurnStartOptions extends SendOptions {
  history: AgentMessage[];
  mode: AgentMode;
  sessionId: string;
  workspaceId: string;
  workspaceRoot: string;
  subAgentEvents: SubAgentEventSink;
  fileCheckpoint?: FileCheckpoint;
}

export interface StartedRun {
  run: AgentRun;
  childRuns: Map<string, AgentRun>;
  handle: RunHandle<AgentEventDataMap>;
  sessionId: string;
}

export interface ChatTurnService {
  submitUserTurn(content: string, options: {
    history: { current: AgentMessage[] };
    sessionId: string;
    workspaceId: string;
    workspaceRoot: string;
    subAgentEvents: SubAgentEventSink;
    fileCheckpoint?: FileCheckpoint;
    displayContent?: string;
    silent?: boolean;
    mode: AgentMode;
  }): StartedRun;
}

export interface AgentSessionService {
  getCurrentSessionId(): string | null;
  getWorkspaceId(): string;
  getWorkspace(): Workspace;
  ensureSession(title?: string): string;
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
