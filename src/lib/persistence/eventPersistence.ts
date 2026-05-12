import Database from "better-sqlite3";
import { getDb } from "../../db/index.js";
import { AgentEvent, Session } from "../eventTypes.js";
import { PAGE_SIZE } from "../../types.js";

interface SessionRow {
  id: string;
  started_at: string;
  updated_at: string;
  metadata: string | null;
}

interface EventRow {
  id: string;
  session_id: string;
  sequence: number;
  type: string;
  timestamp: string;
  data: string;
  parent_event_id: string | null;
  related_tool_call_id: string | null;
}

interface CountRow {
  count: number;
}

export function persistSession(session: Session, db?: Database.Database): void {
  const _db = db ?? getDb();
  _db
    .prepare(
      "INSERT OR REPLACE INTO sessions (id, started_at, updated_at, metadata) VALUES (?, ?, ?, ?)",
    )
    .run(
      session.id,
      session.startedAt,
      session.updatedAt,
      JSON.stringify(session.metadata),
    );
}

export function persistEvents(events: AgentEvent[], db?: Database.Database): void {
  const _db = db ?? getDb();
  const stmt = _db.prepare(
    "INSERT OR IGNORE INTO agent_events (id, session_id, sequence, type, timestamp, data, parent_event_id, related_tool_call_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertMany = _db.transaction((evts: AgentEvent[]) => {
    for (const e of evts) {
      stmt.run(
        e.id,
        e.sessionId,
        e.sequence,
        e.type,
        e.timestamp,
        JSON.stringify(e.data),
        e.parentEventId ?? null,
        e.relatedToolCallId ?? null,
      );
    }
  });
  insertMany(events);
}

export function persistEvent(event: AgentEvent, db?: Database.Database): void {
  persistEvents([event], db);
}

export function loadSessions(
  limit: number = PAGE_SIZE,
  offset: number = 0,
  db?: Database.Database,
): Session[] {
  const _db = db ?? getDb();
  const rows = _db
    .prepare(
      "SELECT id, started_at, updated_at, metadata FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?",
    )
    .all(limit, offset) as SessionRow[];

  return rows.reverse().map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : { userInput: "" },
  }));
}

export function loadSessionEvents(
  sessionId: string,
  db?: Database.Database,
): AgentEvent[] {
  const _db = db ?? getDb();
  const rows = _db
    .prepare(
      "SELECT id, session_id, sequence, type, timestamp, data, parent_event_id, related_tool_call_id FROM agent_events WHERE session_id = ? ORDER BY sequence ASC",
    )
    .all(sessionId) as EventRow[];

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    type: row.type as AgentEvent["type"],
    timestamp: row.timestamp,
    data: JSON.parse(row.data),
    ...(row.parent_event_id ? { parentEventId: row.parent_event_id } : {}),
    ...(row.related_tool_call_id ? { relatedToolCallId: row.related_tool_call_id } : {}),
  }));
}

export function getSessionCount(db?: Database.Database): number {
  const _db = db ?? getDb();
  const row = _db
    .prepare("SELECT COUNT(*) as count FROM sessions")
    .get() as CountRow;
  return row.count;
}

export function deleteAllSessions(db?: Database.Database): void {
  const _db = db ?? getDb();
  _db.exec("DELETE FROM agent_events");
  _db.exec("DELETE FROM sessions");
}
