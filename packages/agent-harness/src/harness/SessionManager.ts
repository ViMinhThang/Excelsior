import type { Session } from "@excelsior/core";
import type { EventRepository } from "../repository/EventRepository.js";

export class SessionManager {
  public sessions: Session[] = [];
  public currentSessionId: string | null = null;

  constructor(
    private readonly eventRepository: EventRepository,
    private readonly workspaceId: string,
  ) {
    this.refreshSessions();
  }

  refreshSessions(): void {
    this.sessions = this.eventRepository.listSessions(this.workspaceId);
  }

  currentSession(): Session | null {
    if (!this.currentSessionId) return null;
    return this.sessions.find((s) => s.id === this.currentSessionId) ?? null;
  }

  createSession(title = "Untitled"): Session {
    const session = this.eventRepository.createSession(this.workspaceId, title);
    this.currentSessionId = session.id;
    this.refreshSessions();
    return session;
  }

  deleteSession(sessionId: string): void {
    this.eventRepository.deleteSession(this.workspaceId, sessionId);
    this.refreshSessions();
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = this.sessions[0]?.id ?? null;
    }
  }

  deleteAllSessions(): void {
    this.eventRepository.deleteAllSessions(this.workspaceId);
    this.currentSessionId = null;
    this.refreshSessions();
  }

  renameSession(sessionId: string, title: string): void {
    this.eventRepository.renameSession(this.workspaceId, sessionId, title);
    this.refreshSessions();
  }
}
