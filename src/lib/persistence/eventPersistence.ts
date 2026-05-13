import Database from "better-sqlite3";
import { getDb } from "../../db/index.js";
import { AgentEvent, AnyAgentEvent, AgentEventType, Session } from "../eventTypes.js";
import * as QUERIES from "./queries.js";

interface SessionRow {
  id: string;
  started_at: string;
  updated_at: string;
  metadata: string | null;
  workspace_id: string | null;
  title: string | null;
}

interface EventRow {
  id: string;
  session_id: string;
  run_id: string | null;
  sequence: number;
  type: string;
  timestamp: string;
  data: string;
  parent_event_id: string | null;
  related_tool_call_id: string | null;
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

function rowToEvent(row: EventRow): AnyAgentEvent {
  return {
    id: row.id,
    runId: row.run_id ?? row.session_id,
    sequence: row.sequence,
    type: row.type as AgentEventType,
    timestamp: row.timestamp,
    data: JSON.parse(row.data),
    version: 1,
    causationId: "",
    correlationId: "",
    ...(row.parent_event_id ? { parentEventId: row.parent_event_id } : {}),
    ...(row.related_tool_call_id ? { relatedToolCallId: row.related_tool_call_id } : {}),
  } as AnyAgentEvent;
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

export function persistEvents(events: AgentEvent[], sessionId: string, db?: Database.Database): void {
  const _db = db ?? getDb();
  const stmt = _db.prepare(QUERIES.INSERT_EVENT);
  const insertMany = _db.transaction((evts: AgentEvent[]) => {
    for (const e of evts) {
      stmt.run(
        e.id,
        sessionId,
        e.runId,
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
    const list = bySession.get(sessionId);
    if (list) list.push(e as unknown as AnyAgentEvent);
    else bySession.set(sessionId, [e as unknown as AnyAgentEvent]);
  }
  for (const [sid, evts] of bySession) {
    cacheEvents(sid, evts);
  }
}

export function persistEvent(event: AgentEvent, sessionId: string, db?: Database.Database): void {
  const _db = db ?? getDb();
  const stmt = _db.prepare(QUERIES.INSERT_EVENT);
  stmt.run(
    event.id,
    sessionId,
    event.runId,
    event.sequence,
    event.type,
    event.timestamp,
    JSON.stringify(event.data),
    event.parentEventId ?? null,
    event.relatedToolCallId ?? null,
  );
  cacheEvents(sessionId, [event as unknown as AnyAgentEvent]);
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

export function loadSessionEvents(
  sessionId: string,
  db?: Database.Database,
): AnyAgentEvent[] {
  const cached = getCachedEvents(sessionId);
  if (cached) return cached;

  const _db = db ?? getDb();
  const rows = _db
    .prepare(QUERIES.SELECT_SESSION_EVENTS)
    .all(sessionId) as EventRow[];

  const events = rows.map(rowToEvent);

  if (!db) {
    cacheEvents(sessionId, events);
  }
  return events;
}

export function loadAllParentEvents(db?: Database.Database): AnyAgentEvent[] {
  const _db = db ?? getDb();
  const rows = _db
    .prepare(QUERIES.SELECT_ALL_PARENT_EVENTS)
    .all() as EventRow[];

  return rows.map(rowToEvent);
}

export function deleteAllSessions(includeChildSessions?: boolean, db?: Database.Database): void {
  const _db = db ?? getDb();
  _db.exec(QUERIES.DELETE_ALL_EVENTS);
  if (includeChildSessions) {
    _db.exec(QUERIES.DELETE_ALL_SESSIONS);
  } else {
    _db.exec(QUERIES.DELETE_PARENT_SESSIONS);
  }
  clearCache();
}
