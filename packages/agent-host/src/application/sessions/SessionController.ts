import type { Session } from "@excelsior/core";
import type { AgentStateStore } from "../state/AgentStateStore.js";
import type { AgentSessionService } from "../types.js";
import type { SessionHistoryStore } from "../history/SessionHistoryStore.js";
import type { AnyAgentEvent } from "../../lib/runtime/events.js";

export class SessionController {
  constructor(
    private readonly sessionManager: AgentSessionService,
    private readonly historyStore: SessionHistoryStore,
    private readonly state: AgentStateStore,
    private readonly cancelActiveTurn: () => void,
  ) {}

  loadInitialData(): void {
    this.refreshSessions();
  }

  ensureSession(title?: string): string {
    const sessionId = this.sessionManager.ensureSession(title);
    this.refreshSessions();
    return sessionId;
  }

  createSession(title?: string): Session {
    const session = this.sessionManager.createSession(title);
    this.refreshSessions();
    return session;
  }

  async switchSession(sessionId: string): Promise<void> {
    this.cancelActiveTurn();
    this.sessionManager.switchSession(sessionId);
    this.refreshSessions();
    this.state.setPersistedEvents([]);
    await this.reloadCurrentSessionEvents();
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionManager.deleteSession(sessionId);
    this.refreshSessions();
    if (this.currentSessionId === null) {
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

  get currentSessionId(): string | null {
    return this.sessionManager.getCurrentSessionId();
  }

  get workspaceId(): string {
    return this.sessionManager.getWorkspaceId();
  }

  get workspaceRoot(): string {
    return this.sessionManager.getWorkspace().rootPath;
  }

  clearViewState(): void {
    this.state.clearSessionView();
  }

  async reloadCurrentSessionEvents(): Promise<void> {
    const sessionId = this.currentSessionId;
    this.state.setPersistedEvents(
      sessionId ? await this.historyStore.loadCompletedEvents(sessionId) : [],
    );
  }

  appendFinalEvents(finalEvents: readonly AnyAgentEvent[]): void {
    this.state.appendPersistedEvents(finalEvents);
  }

  private refreshSessions(): void {
    this.state.setSessionState({
      sessions: this.sessionManager.listSessions(),
      currentSessionId: this.sessionManager.getCurrentSessionId(),
      workspace: this.sessionManager.getWorkspace(),
    });
  }
}
