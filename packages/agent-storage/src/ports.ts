import type { Session, Workspace } from "@excelsior/core";

export interface AnyAgentEvent {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  version: number;
  causationId: string;
  correlationId: string;
  timestamp: string;
  data: unknown;
  parentEventId?: string;
  relatedToolCallId?: string;
}

export interface WorkspaceRepository {
  create(name: string, rootPath: string): Workspace;
  load(id: string): Workspace | null;
  loadAll(): Workspace[];
  delete(id: string): void;
  getOrCreateDefault(): Workspace;
}

export interface SessionRepository {
  persist(session: Session): void;
  loadByWorkspace(workspaceId: string): Session[];
  updateTitle(sessionId: string, title: string): void;
  delete(sessionId: string): void;
  deleteAll(includeChildSessions?: boolean): void;
}

export interface StorageEngine {
  workspaces: WorkspaceRepository;
  sessions: SessionRepository;
}

export interface LastCompletedTurn {
  runId: string;
  eventCount: number;
  checkpointIndex: number;
}

export interface DropLastCompletedTurnResult {
  dropped: boolean;
  runId?: string;
  removedEvents: number;
  reason?: "no-completed-turn" | "latest-turn-mismatch";
}

export interface RunEventStore {
  append(sessionId: string, event: AnyAgentEvent): Promise<void>;
  load(sessionId: string): Promise<AnyAgentEvent[]>;
  delete(sessionId: string): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface TurnCheckpointStore {
  completeTurn(sessionId: string, runId: string, sequence: number): Promise<void>;
  getLastCompletedTurn(sessionId: string): Promise<LastCompletedTurn | null>;
  dropLastCompletedTurn(sessionId: string, expectedRunId?: string): Promise<DropLastCompletedTurnResult>;
}
