import type {
  AgentMessage,
  AgentMode,
  CommandResult,
  Session,
} from "@excelsior/core";
import { ChatService } from "./chatService.js";
import { SessionManager } from "../sessionManager.js";
import { createSubAgentEventSink } from "../lib/runtime/subAgentEventSink.js";
import type { SubAgentEventSink } from "../lib/runtime/subAgentEventSink.js";
import { FileCheckpoint } from "../lib/revert/fileCheckpoint.js";
import { subscribeSubAgentNotifications } from "./turns/subAgentNotifications.js";
import { ProjectionService } from "./projection/ProjectionService.js";
import { RevertController } from "./revert/RevertController.js";
import { SessionController } from "./sessions/SessionController.js";
import { AgentStateStore } from "./state/AgentStateStore.js";
import { TurnController } from "./turns/TurnController.js";
import {
  defaultSessionHistoryStore,
  type SessionHistoryStore,
} from "./history/SessionHistoryStore.js";
import type {
  AgentApplicationOptions,
  AgentSessionService,
  ChatSessionState,
  ChatTurnService,
  SendOptions,
} from "./types.js";

export class AgentApplication {
  private readonly state: AgentStateStore;
  private readonly projection: ProjectionService;
  private readonly sessions: SessionController;
  private readonly turns: TurnController;
  private readonly revert: RevertController;
  private readonly subAgentEvents: SubAgentEventSink;
  private readonly fileCheckpoint: FileCheckpoint;
  private readonly historyStore: SessionHistoryStore;
  private subAgentUnsubs: Array<() => void> = [];
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(workspaceId?: string, options?: AgentApplicationOptions) {
    const service = options?.chatService ?? new ChatService();
    const sessionManager =
      options?.sessionManager ?? new SessionManager(workspaceId);

    this.projection = new ProjectionService();
    this.historyStore = options?.historyStore ?? defaultSessionHistoryStore;
    this.fileCheckpoint = options?.fileCheckpoint ?? new FileCheckpoint();
    this.subAgentEvents = createSubAgentEventSink();
    this.state = new AgentStateStore(
      { workspace: sessionManager.getWorkspace() },
      this.projection,
    );

    let sessions!: SessionController;
    this.turns = new TurnController(service, this.state, (events) =>
      sessions.appendFinalEvents(events),
    );
    sessions = new SessionController(
      sessionManager,
      this.historyStore,
      this.state,
      () => this.turns.cancel(),
    );
    this.sessions = sessions;
    this.revert = new RevertController(
      this.state,
      this.sessions,
      this.historyStore,
      this.fileCheckpoint,
    );

    this.sessions.loadInitialData();
    this.subAgentUnsubs = subscribeSubAgentNotifications(
      this.subAgentEvents,
      () => this.scheduleStateNotify(),
    );
  }

  getSnapshot(): ChatSessionState {
    return this.state.getSnapshot();
  }

  subscribe(cb: () => void): () => void {
    return this.state.subscribe(cb);
  }

  send(content: string, options?: SendOptions): void {
    if (this.state.isLoading || this.disposed) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    // set the session name as the user's first prompt of the session
    const sessionId = this.sessions.ensureSession(trimmed);
    // take the current history to build the context for LLM
    const history = this.buildAIHistory();

    this.turns.startTurn(trimmed, {
      history,
      sessionId,
      workspaceId: this.sessions.workspaceId,
      workspaceRoot: this.sessions.workspaceRoot,
      subAgentEvents: this.subAgentEvents,
      fileCheckpoint: this.fileCheckpoint,
      displayContent: options?.displayContent,
      silent: options?.silent,
      mode: this.state.mode,
    });
  }

  switchSession(sessionId: string): Promise<void> {
    return this.sessions.switchSession(sessionId);
  }

  createSession(title?: string): Session {
    return this.sessions.createSession(title);
  }

  deleteSession(sessionId: string): Promise<void> {
    return this.sessions.deleteSession(sessionId);
  }

  renameSession(sessionId: string, title: string): void {
    this.sessions.renameSession(sessionId, title);
  }

  listSessions(): Session[] {
    return this.sessions.listSessions();
  }

  getCurrentSessionId(): string | null {
    return this.sessions.currentSessionId;
  }

  setMode(mode: AgentMode): void {
    this.state.setMode(mode);
  }

  toggleMode(): AgentMode {
    return this.state.toggleMode();
  }

  cancel(): void {
    this.turns.cancel();
  }

  clear(): void {
    this.turns.cancel();
    this.sessions.clearViewState();
  }

  revertLastTurn(): Promise<CommandResult> {
    return this.revert.revertLastTurn();
  }

  get run() {
    return this.turns.run;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.turns.dispose();
    for (const unsub of this.subAgentUnsubs) unsub();
    this.subAgentUnsubs = [];
    if (this.notifyTimer !== null) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    this.state.dispose();
  }

  private buildAIHistory(): AgentMessage[] {
    return this.projection.buildAIHistory(this.state.getProjectionInput());
  }

  private scheduleStateNotify(): void {
    if (this.notifyTimer !== null) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.state.notifyExternalChange();
    }, 0);
  }
}

export type {
  AgentApplicationOptions,
  AgentSessionService,
  ChatSessionState,
  ChatTurnService,
};
