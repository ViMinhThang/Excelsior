import type { Session, Workspace } from "@excelsior/core";
import type {
  RunRecorder,
  LastCompletedTurn,
  DropLastCompletedTurnResult,
} from "../../persistence/runRecorder.js";
import type { AnyAgentEvent } from "../../runtime/events.js";

export interface SessionMetadataStore {
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
}

export interface AgentSessionStorage extends SessionMetadataStore {
  loadCurrentSessionEvents(): Promise<AnyAgentEvent[]>;
  getLastCompletedTurn(sessionId: string): Promise<LastCompletedTurn | null>;
  trimLastCompletedTurn(sessionId: string, expectedRunId?: string): Promise<DropLastCompletedTurnResult>;
  recordTurnComplete(sessionId: string, runId: string, sequence: number): Promise<void>;
}

export interface SessionStorageCoordinatorOptions {
  sessions: SessionMetadataStore;
  recorder: RunRecorder;
}

export class SessionStorageCoordinator implements AgentSessionStorage {
  private readonly sessions: SessionMetadataStore;
  private readonly recorder: RunRecorder;

  constructor(options: SessionStorageCoordinatorOptions) {
    this.sessions = options.sessions;
    this.recorder = options.recorder;
  }

  getCurrentSessionId(): string | null {
    return this.sessions.getCurrentSessionId();
  }

  getWorkspaceId(): string {
    return this.sessions.getWorkspaceId();
  }

  getWorkspace(): Workspace {
    return this.sessions.getWorkspace();
  }

  ensureSession(title?: string, userInput?: string): string {
    return this.sessions.ensureSession(title, userInput);
  }

  createSession(title?: string): Session {
    return this.sessions.createSession(title);
  }

  switchSession(sessionId: string): void {
    this.sessions.switchSession(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessions.deleteSession(sessionId);
    await this.recorder.deleteSessionEvents(sessionId);
  }

  async deleteAllSessions(): Promise<void> {
    await this.sessions.deleteAllSessions();
    await this.recorder.deleteAllSessionEvents();
  }

  renameSession(sessionId: string, title: string): void {
    this.sessions.renameSession(sessionId, title);
  }

  listSessions(): Session[] {
    return this.sessions.listSessions();
  }

  async loadCurrentSessionEvents(): Promise<AnyAgentEvent[]> {
    const sessionId = this.getCurrentSessionId();
    return sessionId ? this.recorder.loadCompletedEvents(sessionId) : [];
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
}
