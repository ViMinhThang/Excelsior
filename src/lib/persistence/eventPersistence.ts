import Database from "better-sqlite3";
import { getDb } from "../../db/index.js";
import { AnyAgentEvent } from "../runtime/events.js";
import type { Session } from "../runtime/session.js";
import * as QUERIES from "./queries.js";
import { loadSessionEvents as loadFromRollout, deleteSessionEvents, deleteAllSessionsEvents } from "./rolloutRecorder.js";

interface SessionRow {
  id: string;
  started_at: string;
  updated_at: string;
  metadata: string | null;
  workspace_id: string | null;
  title: string | null;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : { userInput: "" },
    workspaceId: row.workspace_id ?? undefined,
    title: row.title ?? undefined,
  };
}

export function persistSession(session: Session, db?: Database.Database): void {
  const _db = db ?? getDb();
  _db
    .prepare(QUERIES.INSERT_SESSION)
    .run(
      session.id,
      session.startedAt,
      session.updatedAt,
      JSON.stringify(session.metadata ?? {}),
      (session as any).workspaceId ?? null,
      (session as any).title ?? null,
    );
}

export function loadSessions(db?: Database.Database): Session[] {
  const _db = db ?? getDb();
  const rows = _db
    .prepare(QUERIES.SELECT_PARENT_SESSIONS)
    .all() as SessionRow[];
  return rows.reverse().map(rowToSession);
}

export function loadChildSessions(parentSessionId?: string, db?: Database.Database): Session[] {
  const _db = db ?? getDb();
  if (parentSessionId) {
    const rows = _db
      .prepare(QUERIES.SELECT_CHILD_SESSIONS_EXCLUDING)
      .all(parentSessionId) as SessionRow[];
    return rows.map(rowToSession);
  }
  const rows = _db
    .prepare(QUERIES.SELECT_CHILD_SESSIONS_ALL)
    .all() as SessionRow[];
  return rows.map(rowToSession);
}

export async function loadSessionEvents(sessionId: string): Promise<AnyAgentEvent[]> {
  return loadFromRollout(sessionId);
}

export function loadSessionsByWorkspace(workspaceId: string, db?: Database.Database): Session[] {
  const _db = db ?? getDb();
  const rows = _db
    .prepare(QUERIES.SELECT_SESSIONS_BY_WORKSPACE)
    .all(workspaceId) as SessionRow[];
  return rows.map(rowToSession);
}

export function deleteSession(sessionId: string, db?: Database.Database): void {
  const _db = db ?? getDb();
  deleteSessionEvents(sessionId);
  _db.prepare(QUERIES.DELETE_SESSION).run(sessionId);
}

export function updateSessionTitle(sessionId: string, title: string, db?: Database.Database): void {
  const _db = db ?? getDb();
  _db.prepare(QUERIES.UPDATE_SESSION_TITLE).run(title, new Date().toISOString(), sessionId);
}

export function deleteAllSessions(includeChildSessions?: boolean, db?: Database.Database): void {
  const _db = db ?? getDb();
  deleteAllSessionsEvents();
  if (includeChildSessions) {
    _db.exec(QUERIES.DELETE_ALL_SESSIONS);
  } else {
    _db.exec(QUERIES.DELETE_PARENT_SESSIONS);
  }
}
