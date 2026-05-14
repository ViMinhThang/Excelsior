import { Session } from "../../lib/runtime/session.js";
import {
  loadSessionsByWorkspace,
  deleteSession as deleteSessionFromDB,
  updateSessionTitle,
  persistSession,
} from "../../lib/persistence/eventPersistence.js";
import { getDefaultWorkspace } from "../../lib/persistence/workspaceStore.js";

export interface SessionManagerState {
  currentSessionId: string | null;
  currentWorkspaceId: string;
  workspaceRootPath: string;
  sessions: Session[];
}

export class SessionManager {
  private _currentWorkspaceId: string;
  private _workspaceRootPath: string;
  private _currentSessionId: string | null = null;
  private _sessions: Session[] = [];
  private _listeners = new Set<() => void>();
  private _snapshot: SessionManagerState | null = null;

  constructor(workspaceId?: string) {
    const ws = getDefaultWorkspace();
    this._currentWorkspaceId = workspaceId ?? ws.id;
    this._workspaceRootPath = ws.rootPath;
    this._reloadSessions();
    this._updateSnapshot();
  }

  // ─── useSyncExternalStore contract ───────────────────────────

  getSnapshot(): SessionManagerState {
    if (!this._snapshot) this._updateSnapshot();
    return this._snapshot!;
  }

  subscribe(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  // ─── Public API ──────────────────────────────────────────────

  getCurrentSessionId(): string | null {
    return this._currentSessionId;
  }

  getWorkspaceId(): string {
    return this._currentWorkspaceId;
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

  ensureSession(): string {
    if (this._currentSessionId) return this._currentSessionId;
    const id = this._createAndPersist("Untitled");
    this._currentSessionId = id;
    this._reloadSessions();
    this._notify();
    return id;
  }

  createSession(title?: string): Session {
    const now = new Date().toISOString();
    const id = this._createAndPersist(title ?? "Untitled");
    this._currentSessionId = id;
    this._reloadSessions();
    this._notify();
    return { id, startedAt: now, updatedAt: now, metadata: { userInput: "" }, workspaceId: this._currentWorkspaceId, title: title ?? "Untitled" };
  }

  switchSession(sessionId: string): void {
    this._currentSessionId = sessionId;
    this._notify();
  }

  deleteSession(sessionId: string): void {
    deleteSessionFromDB(sessionId);
    if (this._currentSessionId === sessionId) {
      this._currentSessionId = null;
    }
    this._reloadSessions();
    this._notify();
  }

  renameSession(sessionId: string, title: string): void {
    updateSessionTitle(sessionId, title);
    this._reloadSessions();
    this._notify();
  }

  listSessions(): Session[] {
    return [...this._sessions];
  }

  // ─── Private ─────────────────────────────────────────────────

  private _reloadSessions(): void {
    this._sessions = loadSessionsByWorkspace(this._currentWorkspaceId);
  }

  private _updateSnapshot(): void {
    this._snapshot = {
      currentSessionId: this._currentSessionId,
      currentWorkspaceId: this._currentWorkspaceId,
      workspaceRootPath: this._workspaceRootPath,
      sessions: [...this._sessions],
    };
  }

  private _notify(): void {
    this._updateSnapshot();
    for (const cb of this._listeners) {
      try { cb(); } catch (err) {
        process.stderr.write(`session: listener error: ${err}\n`);
      }
    }
  }
}
