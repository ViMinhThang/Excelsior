import type { AgentMessage, Session, Workspace } from "@excelsior/core";
import type { RunHandle } from "@excelsior/run-runtime";
import type { AgentMode } from "../../lib/runtime/agentMode.js";
import type { AgentRun } from "../../lib/runtime/agentRun.js";
import type {
  AgentEventDataMap,
  AnyAgentEvent,
} from "../../lib/runtime/events.js";
import type { ProjectedBlock } from "../../lib/projection/display.js";
import type { SubAgentEventSink } from "../../lib/runtime/subAgentEventSink.js";

export interface ChatSessionState {
  displayBlocks: ProjectedBlock[];
  isLoading: boolean;
  sessions: Session[];
  activeRun: AgentRun | null;
  currentSessionId: string | null;
  workspace: Workspace;
  mode: AgentMode;
}

export interface AgentManagerOptions {
  chatService?: ChatTurnService;
  sessionManager?: AgentSessionService;
}

export interface SendOptions {
  displayContent?: string;
  silent?: boolean;
}

export interface RunLifecycleStartOptions extends SendOptions {
  history: AgentMessage[];
  mode: AgentMode;
  sessionId: string;
  workspaceId: string;
  subAgentEvents: SubAgentEventSink;
}

export interface StartedRun {
  run: AgentRun;
  childRuns: Map<string, AgentRun>;
  handle: RunHandle<AgentEventDataMap>;
  sessionId: string;
}

export type FinalEventAppender = (
  events: readonly AnyAgentEvent[],
) => void;

export interface ChatTurnService {
  submitUserTurn(content: string, options: {
    history: { current: AgentMessage[] };
    sessionId: string;
    workspaceId: string;
    subAgentEvents: SubAgentEventSink;
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
