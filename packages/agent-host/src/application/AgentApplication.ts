import type {
  AgentMode,
  CommandResult,
  Session,
} from "@excelsior/core";
import { SessionManager, type AgentSessionStorage } from "../sessionManager.js";
import { createSubAgentEventSink } from "../runtime/subAgentEventSink.js";
import type { SubAgentEventSink } from "../runtime/subAgentEventSink.js";
import { subscribeSubAgentNotifications } from "./turns/subAgentNotifications.js";
import { ProjectionPolicy } from "./projection/ProjectionPolicy.js";
import { AgentStateStore } from "./state/AgentStateStore.js";
import { TurnLifecycle } from "./turns/TurnLifecycle.js";
import {
  defaultRunRecorder,
  type RunRecorder,
  storageEngine as defaultStorageEngine,
} from "@excelsior/agent-storage";
import {
  compactProjectedConversation,
  type CompactionTriggerMode,
} from "./context/compactionPolicy.js";
import type {
  AgentApplicationOptions,
  ChatSessionState,
  SendOptions,
} from "./types.js";

export class AgentApplication {
  private readonly state: AgentStateStore;
  private readonly projection: ProjectionPolicy;
  private readonly sessions: AgentSessionStorage;
  private readonly turns: TurnLifecycle;
  private readonly subAgentEvents: SubAgentEventSink;
  private readonly recorder: RunRecorder;
  private subAgentUnsubs: Array<() => void> = [];
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(workspaceId?: string, options?: AgentApplicationOptions) {
    this.recorder = options?.recorder ?? defaultRunRecorder;
    this.sessions =
      options?.sessionStorage ??
      new SessionManager(
        workspaceId,
        options?.storageEngine ?? defaultStorageEngine,
        this.recorder,
      );

    this.projection = new ProjectionPolicy();
    this.subAgentEvents = createSubAgentEventSink();
    this.state = new AgentStateStore(
      { workspace: this.sessions.getWorkspace() },
      this.projection,
    );

    this.turns = new TurnLifecycle({
      state: this.state,
      projection: this.projection,
      recorder: this.recorder,
      subAgentEvents: this.subAgentEvents,
      sessionStorage: this.sessions,
      appendFinalEvents: (events) => this.state.appendPersistedEvents(events),
      dependencies: options?.turnLifecycle,
      confirmBus: options?.confirmBus,
      questionBus: options?.questionBus,
      compactCurrentSession: (triggerMode) => this.compactCurrentSession(triggerMode),
    });

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

  async send(content: string, options?: SendOptions): Promise<void> {
    if (this.state.isLoading || this.disposed) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    // set the session name as the user's first prompt of the session
    const displayContent = options?.displayContent ?? trimmed;
    const sessionId = this.ensureSession(trimmed, displayContent);

    await this.turns.startUserTurn({
      content: trimmed,
      sessionId,
      workspaceRoot: this.workspaceRoot,
      displayContent: options?.displayContent,
      silent: options?.silent,
      mode: this.state.mode,
    });
  }

  ensureSession(title?: string, userInput?: string): string {
    const sessionId = this.sessions.ensureSession(title, userInput);
    this.refreshSessions();
    return sessionId;
  }

  async switchSession(sessionId: string): Promise<void> {
    this.turns.cancel();
    this.sessions.switchSession(sessionId);
    this.refreshSessions();
    this.state.setPersistedEvents([]);
    await this.reloadCurrentSessionEvents();
  }

  createSession(title?: string): Session {
    const session = this.sessions.createSession(title);
    this.refreshSessions();
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessions.deleteSession(sessionId);
    this.refreshSessions();
    if (this.getCurrentSessionId() === null) {
      this.state.setPersistedEvents([]);
    }
  }

  async deleteAllSessions(): Promise<void> {
    await this.sessions.deleteAllSessions();
    this.refreshSessions();
    this.state.setPersistedEvents([]);
  }

  renameSession(sessionId: string, title: string): void {
    this.sessions.renameSession(sessionId, title);
    this.refreshSessions();
  }

  listSessions(): Session[] {
    return this.sessions.listSessions();
  }

  getCurrentSessionId(): string | null {
    return this.sessions.getCurrentSessionId();
  }

  get currentSessionId(): string | null {
    return this.getCurrentSessionId();
  }

  get workspaceRoot(): string {
    return this.sessions.getWorkspace().rootPath;
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
    this.state.setPersistedEvents(await this.sessions.loadCurrentSessionEvents());
  }

  revertLastTurn(): Promise<CommandResult> {
    return this.turns.revertLastTurn(this.state, this.sessions);
  }

  get run() {
    return this.turns.run;
  }

  async compactCurrentSession(triggerMode: CompactionTriggerMode = "manual"): Promise<void> {
    await compactProjectedConversation({
      sessionId: this.getCurrentSessionId(),
      history: this.projection.project(this.state.getProjectionInput()).aiHistory,
      persistedEventCount: this.state.persistedEvents.length,
      triggerMode,
      activeRunId: this.state.activeRun?.id,
      recordEvent: (sessionId, event) => this.recorder.recordEvent(sessionId, event),
      reloadCurrentSessionEvents: () => this.reloadCurrentSessionEvents(),
    });
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
      sessions: this.sessions.listSessions(),
      currentSessionId: this.sessions.getCurrentSessionId(),
      workspace: this.sessions.getWorkspace(),
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
