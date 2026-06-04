import type { Session } from "@excelsior/core";
import type { FileHarnessStorage } from "./storage.js";

export class SessionManager {
  public sessions: Session[] = [];
  public currentSessionId: string | null = null;

  constructor(
    private readonly storage: FileHarnessStorage,
    private readonly workspaceId: string,
  ) {
    this.refreshSessions();
    if (this.sessions.length > 0) {
      this.currentSessionId = this.sessions[0].id;
    }
  }

  refreshSessions(): void {
    this.sessions = this.storage.listSessions(this.workspaceId);
  }

  currentSession(): Session | null {
    if (!this.currentSessionId) return null;
    return this.sessions.find((s) => s.id === this.currentSessionId) ?? null;
  }

  createSession(title = "Untitled"): Session {
    const session = this.storage.createSession(this.workspaceId, title);
    this.currentSessionId = session.id;
    this.refreshSessions();
    return session;
  }

  deleteSession(sessionId: string): void {
    this.storage.deleteSession(this.workspaceId, sessionId);
    this.refreshSessions();
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = this.sessions[0]?.id ?? null;
    }
  }

  deleteAllSessions(): void {
    this.storage.deleteAllSessions(this.workspaceId);
    this.currentSessionId = null;
    this.refreshSessions();
  }

  renameSession(sessionId: string, title: string): void {
    this.storage.renameSession(this.workspaceId, sessionId, title);
    this.refreshSessions();
  }
}
