import Database from "better-sqlite3";
import { getDb } from "../../db/index.js";
import { AgentEvent, AnyAgentEvent, AgentEventType, Session } from "../eventTypes.js";
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

const MAX_CACHED_SESSIONS = 10;
const _eventCache = new Map<string, AnyAgentEvent[]>();
const _sessionAccessOrder: string[] = [];

function cacheEvents(sessionId: string, events: AnyAgentEvent[]): void {
  const existing = _eventCache.get(sessionId);
  if (existing) {
    const existingIds = new Set(existing.map((e) => e.id));
    const newEvents = events.filter((e) => !existingIds.has(e.id));
    if (newEvents.length > 0) {
      _eventCache.set(sessionId, [...existing, ...newEvents]);
    }
  } else {
    if (_eventCache.size >= MAX_CACHED_SESSIONS) {
      const oldest = _sessionAccessOrder.shift();
      if (oldest) _eventCache.delete(oldest);
    }
    _eventCache.set(sessionId, [...events]);
    _sessionAccessOrder.push(sessionId);
  }
}

function touchCache(sessionId: string): void {
  const idx = _sessionAccessOrder.indexOf(sessionId);
  if (idx >= 0) {
    _sessionAccessOrder.splice(idx, 1);
    _sessionAccessOrder.push(sessionId);
  }
}

function getCachedEvents(sessionId: string): AnyAgentEvent[] | undefined {
  touchCache(sessionId);
  return _eventCache.get(sessionId);
}

function clearCache(): void {
  _eventCache.clear();
  _sessionAccessOrder.length = 0;
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

  const bySession = new Map<string, AnyAgentEvent[]>();
  for (const e of events) {
    const list = bySession.get(e.sessionId);
    if (list) list.push(e as unknown as AnyAgentEvent);
    else bySession.set(e.sessionId, [e as unknown as AnyAgentEvent]);
  }
  for (const [sessionId, evts] of bySession) {
    cacheEvents(sessionId, evts);
  }
}

export function persistEvent(event: AgentEvent, db?: Database.Database): void {
  const _db = db ?? getDb();
  const stmt = _db.prepare(
    "INSERT OR IGNORE INTO agent_events (id, session_id, sequence, type, timestamp, data, parent_event_id, related_tool_call_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  stmt.run(
    event.id,
    event.sessionId,
    event.sequence,
    event.type,
    event.timestamp,
    JSON.stringify(event.data),
    event.parentEventId ?? null,
    event.relatedToolCallId ?? null,
  );
  cacheEvents(event.sessionId, [event as unknown as AnyAgentEvent]);
}

export function loadSessions(
  limit: number = PAGE_SIZE,
  offset: number = 0,
  db?: Database.Database,
): Session[] {
  const _db = db ?? getDb();
  const rows = _db
    .prepare(
      "SELECT id, started_at, updated_at, metadata FROM sessions WHERE json_extract(metadata, '$.isChildSession') IS NULL OR json_extract(metadata, '$.isChildSession') != 1 ORDER BY started_at DESC LIMIT ? OFFSET ?",
    )
    .all(limit, offset) as SessionRow[];

  return rows.reverse().map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : { userInput: "" },
  }));
}

export function loadChildSessions(parentSessionId?: string, db?: Database.Database): Session[] {
  const _db = db ?? getDb();
  if (parentSessionId) {
    const rows = _db
      .prepare(
        "SELECT id, started_at, updated_at, metadata FROM sessions WHERE json_extract(metadata, '$.isChildSession') = 1 AND id != ? ORDER BY started_at ASC",
      )
      .all(parentSessionId) as SessionRow[];
    return rows.map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : { userInput: "" },
    }));
  }
  const rows = _db
    .prepare(
      "SELECT id, started_at, updated_at, metadata FROM sessions WHERE json_extract(metadata, '$.isChildSession') = 1 ORDER BY started_at ASC",
    )
    .all() as SessionRow[];
  return rows.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : { userInput: "" },
  }));
}

export function getChildSessionCount(db?: Database.Database): number {
  const _db = db ?? getDb();
  const row = _db
    .prepare(
      "SELECT COUNT(*) as count FROM sessions WHERE json_extract(metadata, '$.isChildSession') = 1",
    )
    .get() as CountRow;
  return row.count;
}

export function loadSessionEvents(
  sessionId: string,
  db?: Database.Database,
): AnyAgentEvent[] {
  const cached = getCachedEvents(sessionId);
  if (cached) return cached;

  const _db = db ?? getDb();
  const rows = _db
    .prepare(
      "SELECT id, session_id, sequence, type, timestamp, data, parent_event_id, related_tool_call_id FROM agent_events WHERE session_id = ? ORDER BY sequence ASC",
    )
    .all(sessionId) as EventRow[];

  const events = rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    type: row.type as AgentEventType,
    timestamp: row.timestamp,
    data: JSON.parse(row.data),
    ...(row.parent_event_id ? { parentEventId: row.parent_event_id } : {}),
    ...(row.related_tool_call_id ? { relatedToolCallId: row.related_tool_call_id } : {}),
  })) as AnyAgentEvent[];

  if (!db) {
    cacheEvents(sessionId, events);
  }
  return events;
}

export function getSessionCount(db?: Database.Database): number {
  const _db = db ?? getDb();
  const row = _db
    .prepare("SELECT COUNT(*) as count FROM sessions WHERE json_extract(metadata, '$.isChildSession') IS NULL OR json_extract(metadata, '$.isChildSession') != 1")
    .get() as CountRow;
  return row.count;
}

export function deleteAllSessions(includeChildSessions?: boolean, db?: Database.Database): void {
  const _db = db ?? getDb();
  _db.exec("DELETE FROM agent_events");
  if (includeChildSessions) {
    _db.exec("DELETE FROM sessions");
  } else {
    _db.exec("DELETE FROM sessions WHERE json_extract(metadata, '$.isChildSession') IS NULL OR json_extract(metadata, '$.isChildSession') != 1");
  }
  clearCache();
}
