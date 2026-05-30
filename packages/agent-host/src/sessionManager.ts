import { generateId } from "@excelsior/core";
import type { Session, Workspace } from "@excelsior/core";
import type {
  StorageEngine,
  RunRecorder,
  LastCompletedTurn,
  DropLastCompletedTurnResult,
} from "@excelsior/agent-storage";
import type { AnyAgentEvent } from "./runtime/events.js";

export interface AgentSessionStorage {
  getCurrentSessionId(): string | null;
  getWorkspaceId(): string;
  getWorkspace(): Workspace;
  ensureSession(title?: string, userInput?: string): string;
  createSession(title?: string): Session;
  switchSession(sessionId: string): void;
  deleteSession(sessionId: string): Promise<void>;
  deleteAllSessions(): Promise<void>;
  renameSession(sessionId: string, title: string): void;
  listSessions(): Session[];
  loadCurrentSessionEvents(): Promise<AnyAgentEvent[]>;
  getLastCompletedTurn(sessionId: string): Promise<LastCompletedTurn | null>;
  trimLastCompletedTurn(sessionId: string, expectedRunId?: string): Promise<DropLastCompletedTurnResult>;
  recordTurnComplete(sessionId: string, runId: string, sequence: number): Promise<void>;
}

export class SessionManager implements AgentSessionStorage {
  private _workspace: Workspace;
  private _currentSessionId: string | null = null;
  private _sessions: Session[] = [];

  constructor(
    workspaceId: string | undefined,
    private readonly storage: StorageEngine,
    private readonly recorder: RunRecorder,
  ) {
    const ws = workspaceId
      ? this.storage.workspaces.load(workspaceId) ?? this.storage.workspaces.getOrCreateDefault()
      : this.storage.workspaces.getOrCreateDefault();
    this._workspace = {
      id: ws.id,
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

  ensureSession(title?: string, userInput?: string): string {
    if (this._currentSessionId) {
      this._titleCurrentSessionFromFirstPrompt(title, userInput);
      return this._currentSessionId;
    }
    const id = this._createAndPersist(
      this._normalizeTitle(title),
      userInput?.trim() || title?.trim() || "",
    );
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
    await this.storage.sessions.delete(sessionId);
    await this.recorder.deleteSessionEvents(sessionId);
    if (this._currentSessionId === sessionId) {
      this._currentSessionId = null;
    }
    this._reloadSessions();
  }

  async deleteAllSessions(): Promise<void> {
    await this.storage.sessions.deleteAll();
    await this.recorder.deleteAllSessionEvents();
    this._currentSessionId = null;
    this._reloadSessions();
  }

  renameSession(sessionId: string, title: string): void {
    this.storage.sessions.updateTitle(sessionId, title);
    this._reloadSessions();
  }

  listSessions(): Session[] {
    return [...this._sessions];
  }

  async loadCurrentSessionEvents(): Promise<AnyAgentEvent[]> {
    const sessionId = this.getCurrentSessionId();
    return sessionId
      ? (await this.recorder.loadCompletedEvents(sessionId)) as AnyAgentEvent[]
      : [];
  }

  async getLastCompletedTurn(sessionId: string): Promise<LastCompletedTurn | null> {
    return this.recorder.getLastCompletedTurn(sessionId);
  }

  async trimLastCompletedTurn(sessionId: string, expectedRunId?: string): Promise<DropLastCompletedTurnResult> {
    return this.recorder.dropLastCompletedTurn(sessionId, expectedRunId);
  }

  async recordTurnComplete(sessionId: string, runId: string, sequence: number): Promise<void> {
    await this.recorder.recordTurnComplete(sessionId, runId, sequence);
  }

  private _normalizeTitle(title?: string): string {
    const trimmed = title?.trim() || "Untitled";
    return trimmed.length > 50 ? trimmed.slice(0, 47) + "..." : trimmed;
  }

  private _titleCurrentSessionFromFirstPrompt(title?: string, userInput?: string): void {
    const session = this._sessions.find((s) => s.id === this._currentSessionId);
    const nextTitle = title?.trim();
    const nextInput = userInput?.trim() || nextTitle;
    if (!session || !nextInput) return;
    if (session.metadata.userInput || (session.title && session.title !== "Untitled")) return;
    this.storage.sessions.persist({
      ...session,
      updatedAt: new Date().toISOString(),
      metadata: { ...session.metadata, userInput: nextInput },
      title: this._normalizeTitle(nextTitle),
    });
    this._reloadSessions();
  }

  private _makeSessionId(): string {
    return generateId("ses");
  }

  private _createAndPersist(title: string, userInput = ""): string {
    const now = new Date().toISOString();
    const id = this._makeSessionId();
    this.storage.sessions.persist({
      id,
      startedAt: now,
      updatedAt: now,
      metadata: { userInput },
      workspaceId: this._workspace.id,
      title,
    });
    return id;
  }

  private _reloadSessions(): void {
    this._sessions = this.storage.sessions.loadByWorkspace(this._workspace.id);
  }
}
