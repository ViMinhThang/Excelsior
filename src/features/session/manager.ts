import { Session } from "../../lib/runtime/session.js";
import {
  loadSessionsByWorkspace,
  deleteSession as deleteSessionFromDB,
  updateSessionTitle,
  persistSession,
} from "../../lib/persistence/eventPersistence.js";
import { getDefaultWorkspace } from "../../lib/persistence/workspaceStore.js";

export class SessionManager {
  private _currentWorkspaceId: string;
  private _workspaceRootPath: string;
  private _currentSessionId: string | null = null;
  private _sessions: Session[] = [];

  constructor(workspaceId?: string) {
    const ws = getDefaultWorkspace();
    this._currentWorkspaceId = workspaceId ?? ws.id;
    this._workspaceRootPath = ws.rootPath;
    this._reloadSessions();
  }

  getCurrentSessionId(): string | null {
    return this._currentSessionId;
  }

  getWorkspaceId(): string {
    return this._currentWorkspaceId;
  }

  getWorkspaceRootPath(): string {
    return this._workspaceRootPath;
  }

  ensureSession(title?: string): string {
    if (this._currentSessionId) {
      this._titleCurrentSessionFromFirstPrompt(title);
      return this._currentSessionId;
    }
    const id = this._createAndPersist(this._normalizeTitle(title));
    this._currentSessionId = id;
    this._reloadSessions();
    return id;
  }

  createSession(title?: string): Session {
    const resolvedTitle = title ?? "Untitled";
    const id = this._createAndPersist(resolvedTitle);
    this._currentSessionId = id;
    this._reloadSessions();
    const session = this._sessions.find((s) => s.id === id);
    return session ?? {
      id,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { userInput: "" },
      workspaceId: this._currentWorkspaceId,
      title: resolvedTitle,
    };
  }

  switchSession(sessionId: string): void {
    this._currentSessionId = sessionId;
  }

  deleteSession(sessionId: string): void {
    deleteSessionFromDB(sessionId);
    if (this._currentSessionId === sessionId) {
      this._currentSessionId = null;
    }
    this._reloadSessions();
  }

  renameSession(sessionId: string, title: string): void {
    updateSessionTitle(sessionId, title);
    this._reloadSessions();
  }

  listSessions(): Session[] {
    return [...this._sessions];
  }

  private _normalizeTitle(title?: string): string {
    return title?.trim() || "Untitled";
  }

  private _titleCurrentSessionFromFirstPrompt(title?: string): void {
    const session = this._sessions.find((s) => s.id === this._currentSessionId);
    const nextTitle = title?.trim();
    if (!session || !nextTitle) return;
    if (session.metadata.userInput || (session.title && session.title !== "Untitled")) return;
    updateSessionTitle(session.id, nextTitle);
    this._reloadSessions();
  }

  private _makeSessionId(): string {
    return `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private _createAndPersist(title: string): string {
    const now = new Date().toISOString();
    const id = this._makeSessionId();
    persistSession({
      id,
      startedAt: now,
      updatedAt: now,
      metadata: { userInput: "" },
      workspaceId: this._currentWorkspaceId,
      title,
    });
    return id;
  }

  private _reloadSessions(): void {
    this._sessions = loadSessionsByWorkspace(this._currentWorkspaceId);
  }
}
