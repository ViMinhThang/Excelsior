import type { Session, Workspace } from "@excelsior/core";
import { loadSessionEvents } from "../../lib/persistence/eventPersistence.js";
import type { AnyAgentEvent } from "../../lib/runtime/events.js";
import type { AgentSessionService } from "./types.js";

export class AgentManagerSessionState {
  private _sessions: Session[] = [];
  private _persistedEvents: AnyAgentEvent[] = [];

  constructor(private readonly sessionManager: AgentSessionService) {}

  loadInitialData(): void {
    this.reloadSessions();
  }

  get sessions(): Session[] {
    return this._sessions;
  }

  get persistedEvents(): AnyAgentEvent[] {
    return this._persistedEvents;
  }

  get currentSessionId(): string | null {
    return this.sessionManager.getCurrentSessionId();
  }

  get workspaceId(): string {
    return this.sessionManager.getWorkspaceId();
  }

  get workspace(): Workspace {
    return this.sessionManager.getWorkspace();
  }

  ensureSession(title?: string): string {
    const sessionId = this.sessionManager.ensureSession(title);
    this.reloadSessions();
    return sessionId;
  }

  createSession(title?: string): Session {
    const session = this.sessionManager.createSession(title);
    this.reloadSessions();
    return session;
  }

  beginSwitchSession(sessionId: string): void {
    this.sessionManager.switchSession(sessionId);
    this.reloadSessions();
    this.clearPersistedEvents();
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionManager.deleteSession(sessionId);
    this.reloadSessions();
    if (this.currentSessionId === null) {
      this.clearPersistedEvents();
    }
  }

  renameSession(sessionId: string, title: string): void {
    this.sessionManager.renameSession(sessionId, title);
    this.reloadSessions();
  }

  listSessions(): Session[] {
    return this.sessionManager.listSessions();
  }

  clearViewState(): void {
    this._sessions = [];
    this.clearPersistedEvents();
  }

  async reloadCurrentSessionEvents(): Promise<void> {
    const sid = this.currentSessionId;
    this._persistedEvents = sid ? await loadSessionEvents(sid) : [];
  }

  appendFinalEvents(finalEvents: readonly AnyAgentEvent[]): void {
    if (finalEvents.length === 0) return;

    const ids = new Set(finalEvents.map((event) => event.id));
    this._persistedEvents = [
      ...this._persistedEvents.filter((event) => !ids.has(event.id)),
      ...finalEvents,
    ];
  }

  private reloadSessions(): void {
    this._sessions = this.sessionManager.listSessions();
  }

  private clearPersistedEvents(): void {
    this._persistedEvents = [];
  }
}
