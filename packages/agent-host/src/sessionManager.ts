import type { Session, Workspace } from "@excelsior/core";
import {
  loadSessionsByWorkspace,
  deleteSession as deleteSessionFromDB,
  updateSessionTitle,
  persistSession,
} from "./lib/persistence/eventPersistence.js";
import { getOrCreateDefaultWorkspace } from "./lib/persistence/workspaceStore.js";

export class SessionManager {
  private _workspace: Workspace;
  private _currentSessionId: string | null = null;
  private _sessions: Session[] = [];

  constructor(workspaceId?: string) {
    const ws = getOrCreateDefaultWorkspace();
    this._workspace = {
      id: workspaceId ?? ws.id,
      name: ws.name,
      rootPath: ws.rootPath,
    };
    this._reloadSessions();
  }

  getCurrentSessionId(): string | null {
    return this._currentSessionId;
  }

  getWorkspaceId(): string {
    return this._workspace.id;
  }

  getWorkspace(): Workspace {
    return this._workspace;
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
      workspaceId: this._workspace.id,
      title: resolvedTitle,
    };
  }

  switchSession(sessionId: string): void {
    this._currentSessionId = sessionId;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await deleteSessionFromDB(sessionId);
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
      workspaceId: this._workspace.id,
      title,
    });
    return id;
  }

  private _reloadSessions(): void {
    this._sessions = loadSessionsByWorkspace(this._workspace.id);
  }
}
