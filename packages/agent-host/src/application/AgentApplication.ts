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
import { ProjectionService } from "./projection/ProjectionService.js";
import { RevertController } from "./revert/RevertController.js";
import { SessionController } from "./sessions/SessionController.js";
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

export class AgentApplication {
  private readonly state: AgentStateStore;
  private readonly projection: ProjectionService;
  private readonly sessions: SessionController;
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
    const sessionManager =
      options?.sessionManager ?? new SessionManager(workspaceId);

    this.projection = new ProjectionService();
    this.fileCheckpoint = options?.fileCheckpoint ?? new FileCheckpoint();
    this.subAgentEvents = createSubAgentEventSink();
    this.state = new AgentStateStore(
      { workspace: sessionManager.getWorkspace() },
      this.projection,
    );

    let sessions!: SessionController;
    this.turns = new TurnLifecycle({
      state: this.state,
      projection: this.projection,
      recorder: this.recorder,
      subAgentEvents: this.subAgentEvents,
      fileCheckpoint: this.fileCheckpoint,
      appendFinalEvents: (events) => sessions.appendFinalEvents(events),
      dependencies: options?.turnLifecycle,
    });
    sessions = new SessionController(
      sessionManager,
      this.recorder,
      this.state,
      () => this.turns.cancel(),
    );
    this.sessions = sessions;
    this.revert = new RevertController(
      this.state,
      this.sessions,
      this.recorder,
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
    const displayContent = options?.displayContent ?? trimmed;
    const sessionId = this.sessions.ensureSession(trimmed, displayContent);

    this.turns.startUserTurn({
      content: trimmed,
      sessionId,
      workspaceRoot: this.sessions.workspaceRoot,
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
};
