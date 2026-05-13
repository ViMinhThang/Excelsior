import Database from "better-sqlite3";
import { getDb } from "../../db/index.js";

export type RunKind = "main" | "subagent" | "review";
export type RunStatus = "running" | "completed" | "cancelled" | "failed";

export interface RunRow {
  id: string;
  sessionId: string;
  parentRunId: string | null;
  kind: RunKind;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
}

function rowToRun(r: any): RunRow {
  return {
    id: r.id,
    sessionId: r.session_id,
    parentRunId: r.parent_run_id,
    kind: r.kind,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
  };
}

export function createRun(
  sessionId: string,
  runId: string,
  kind: RunKind = "main",
  parentRunId?: string,
  db?: Database.Database,
): RunRow {
  const _db = db ?? getDb();
  const now = new Date().toISOString();
  _db
    .prepare(
      `INSERT OR IGNORE INTO runs (id, session_id, parent_run_id, kind, status, started_at, ended_at)
       VALUES (?, ?, ?, ?, 'running', ?, NULL)`,
    )
    .run(runId, sessionId, parentRunId ?? null, kind, now);
  return {
    id: runId,
    sessionId,
    parentRunId: parentRunId ?? null,
    kind,
    status: "running",
    startedAt: now,
    endedAt: null,
  };
}

export function completeRun(
  runId: string,
  status: RunStatus = "completed",
  db?: Database.Database,
): void {
  const _db = db ?? getDb();
  const now = new Date().toISOString();
  _db
    .prepare("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?")
    .run(status, now, runId);
}

export function loadRun(
  runId: string,
  db?: Database.Database,
): RunRow | null {
  const _db = db ?? getDb();
  const row = _db
    .prepare("SELECT id, session_id, parent_run_id, kind, status, started_at, ended_at FROM runs WHERE id = ?")
    .get(runId) as any;
  return row ? rowToRun(row) : null;
}

export function loadRunsForSession(
  sessionId: string,
  db?: Database.Database,
): RunRow[] {
  const _db = db ?? getDb();
  const rows = _db
    .prepare("SELECT id, session_id, parent_run_id, kind, status, started_at, ended_at FROM runs WHERE session_id = ? ORDER BY started_at ASC")
    .all(sessionId) as any[];
  return rows.map(rowToRun);
}

export function loadChildRuns(
  parentRunId: string,
  db?: Database.Database,
): RunRow[] {
  const _db = db ?? getDb();
  const rows = _db
    .prepare("SELECT id, session_id, parent_run_id, kind, status, started_at, ended_at FROM runs WHERE parent_run_id = ? ORDER BY started_at ASC")
    .all(parentRunId) as any[];
  return rows.map(rowToRun);
}

export function deleteRunsForSession(sessionId: string, db?: Database.Database): void {
  const _db = db ?? getDb();
  _db.prepare("DELETE FROM runs WHERE session_id = ?").run(sessionId);
}
