import type {
  AgentMode,
  CommandResult,
  Session,
} from "@excelsior/core";
import { SessionManager } from "../sessionManager.js";
import { createSubAgentEventSink } from "../runtime/subAgentEventSink.js";
import type { SubAgentEventSink } from "../runtime/subAgentEventSink.js";
import { FileCheckpoint } from "../revert/fileCheckpoint.js";
import { subscribeSubAgentNotifications } from "./turns/subAgentNotifications.js";
import { ProjectionPolicy } from "./projection/ProjectionPolicy.js";
import { RevertController, type RevertSessionCoordinator } from "./revert/RevertController.js";
import { AgentStateStore } from "./state/AgentStateStore.js";
import { TurnLifecycle } from "./turns/TurnLifecycle.js";
import {
  defaultRunRecorder,
  type RunRecorder,
} from "../persistence/runRecorder.js";
import type {
  AgentApplicationOptions,
  AgentSessionService,
  ChatSessionState,
  SendOptions,
} from "./types.js";

export class AgentApplication implements RevertSessionCoordinator {
  private readonly state: AgentStateStore;
  private readonly projection: ProjectionPolicy;
  private readonly sessionManager: AgentSessionService;
  private readonly turns: TurnLifecycle;
  private readonly revert: RevertController;
  private readonly subAgentEvents: SubAgentEventSink;
  private readonly fileCheckpoint: FileCheckpoint;
  private readonly recorder: RunRecorder;
  private subAgentUnsubs: Array<() => void> = [];
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(workspaceId?: string, options?: AgentApplicationOptions) {
    this.recorder = options?.recorder ?? defaultRunRecorder;
    this.sessionManager =
      options?.sessionManager ?? new SessionManager(workspaceId);

    this.projection = new ProjectionPolicy();
    this.fileCheckpoint = options?.fileCheckpoint ?? new FileCheckpoint();
    this.subAgentEvents = createSubAgentEventSink();
    this.state = new AgentStateStore(
      { workspace: this.sessionManager.getWorkspace() },
      this.projection,
    );

    this.turns = new TurnLifecycle({
      state: this.state,
      projection: this.projection,
      recorder: this.recorder,
      subAgentEvents: this.subAgentEvents,
      fileCheckpoint: this.fileCheckpoint,
      appendFinalEvents: (events) => this.state.appendPersistedEvents(events),
      dependencies: options?.turnLifecycle,
    });
    this.revert = new RevertController(
      this.state,
      this,
      this.recorder,
      this.fileCheckpoint,
    );

    this.refreshSessions();
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
    const displayContent = options?.displayContent ?? trimmed;
    const sessionId = this.ensureSession(trimmed, displayContent);

    this.turns.startUserTurn({
      content: trimmed,
      sessionId,
      workspaceRoot: this.workspaceRoot,
      displayContent: options?.displayContent,
      silent: options?.silent,
      mode: this.state.mode,
    });
  }

  ensureSession(title?: string, userInput?: string): string {
    const sessionId = this.sessionManager.ensureSession(title, userInput);
    this.refreshSessions();
    return sessionId;
  }

  async switchSession(sessionId: string): Promise<void> {
    this.turns.cancel();
    this.sessionManager.switchSession(sessionId);
    this.refreshSessions();
    this.state.setPersistedEvents([]);
    await this.reloadCurrentSessionEvents();
  }

  createSession(title?: string): Session {
    const session = this.sessionManager.createSession(title);
    this.refreshSessions();
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionManager.deleteSession(sessionId);
    await this.recorder.deleteSessionEvents(sessionId);
    this.refreshSessions();
    if (this.getCurrentSessionId() === null) {
      this.state.setPersistedEvents([]);
    }
  }

  renameSession(sessionId: string, title: string): void {
    this.sessionManager.renameSession(sessionId, title);
    this.refreshSessions();
  }

  listSessions(): Session[] {
    return this.sessionManager.listSessions();
  }

  getCurrentSessionId(): string | null {
    return this.sessionManager.getCurrentSessionId();
  }

  get currentSessionId(): string | null {
    return this.getCurrentSessionId();
  }

  get workspaceRoot(): string {
    return this.sessionManager.getWorkspace().rootPath;
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
    this.state.clearSessionView();
  }

  async reloadCurrentSessionEvents(): Promise<void> {
    const sessionId = this.getCurrentSessionId();
    this.state.setPersistedEvents(
      sessionId ? await this.recorder.loadCompletedEvents(sessionId) : [],
    );
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

  private refreshSessions(): void {
    this.state.setSessionState({
      sessions: this.sessionManager.listSessions(),
      currentSessionId: this.sessionManager.getCurrentSessionId(),
      workspace: this.sessionManager.getWorkspace(),
    });
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
  ChatSessionState,
};
