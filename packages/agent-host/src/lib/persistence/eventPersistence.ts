import Database from "better-sqlite3";
import type { Session } from "@excelsior/core";
import { getDb } from "./db.js";
import { AnyAgentEvent } from "../runtime/events.js";
import * as QUERIES from "./queries.js";
import { defaultRunRecorder } from "./runRecorder.js";
import { rowToSession, type SessionDbRow } from "./rowTypes.js";

interface ExistingSessionRow {
  started_at: string;
  title: string | null;
}

export function persistSession(session: Session, db?: Database.Database): void {
  const _db = db ?? getDb();
  const existing = _db
    .prepare("SELECT started_at, title FROM sessions WHERE id = ?")
    .get(session.id) as ExistingSessionRow | undefined;

  _db
    .prepare(QUERIES.INSERT_SESSION)
    .run(
      session.id,
      existing?.started_at ?? session.startedAt,
      session.updatedAt,
      JSON.stringify(session.metadata ?? {}),
      session.workspaceId ?? null,
      session.title ?? existing?.title ?? null,
    );
}

export async function loadSessionEvents(sessionId: string): Promise<AnyAgentEvent[]> {
  return defaultRunRecorder.loadCompletedEvents(sessionId);
}

export function getLastCompletedTurn(sessionId: string) {
  return defaultRunRecorder.getLastCompletedTurn(sessionId);
}

export function dropLastCompletedTurn(sessionId: string, expectedRunId?: string) {
  return defaultRunRecorder.dropLastCompletedTurn(sessionId, expectedRunId);
}

export function loadSessionsByWorkspace(workspaceId: string, db?: Database.Database): Session[] {
  const _db = db ?? getDb();
  const rows = _db
    .prepare(QUERIES.SELECT_SESSIONS_BY_WORKSPACE)
    .all(workspaceId) as SessionDbRow[];
  return rows.map(rowToSession);
}

export async function deleteSession(sessionId: string, db?: Database.Database): Promise<void> {
  const _db = db ?? getDb();
  _db.prepare(QUERIES.DELETE_SESSION).run(sessionId);
  await defaultRunRecorder.deleteSessionEvents(sessionId);
}

export function updateSessionTitle(sessionId: string, title: string, db?: Database.Database): void {
  const _db = db ?? getDb();
  _db.prepare(QUERIES.UPDATE_SESSION_TITLE).run(title, new Date().toISOString(), sessionId);
}

export async function deleteAllSessions(includeChildSessions?: boolean, db?: Database.Database): Promise<void> {
  const _db = db ?? getDb();
  if (includeChildSessions) {
    _db.exec(QUERIES.DELETE_ALL_SESSIONS);
  } else {
    _db.exec(QUERIES.DELETE_PARENT_SESSIONS);
  }
  await defaultRunRecorder.deleteAllSessionEvents();
}
