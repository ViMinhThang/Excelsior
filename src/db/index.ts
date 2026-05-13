import Database from "better-sqlite3";
import { join } from "path";

const DEFAULT_DB_PATH = join(process.cwd(), "data", "index.db");

let _defaultDb: Database.Database | null = null;

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

export function createDb(dbPath?: string): Database.Database {
  const path = dbPath ?? DEFAULT_DB_PATH;
  const db = new Database(path);
  db.pragma("journal_mode = WAL");

  // Core tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      data TEXT NOT NULL,
      parent_event_id TEXT,
      related_tool_call_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_agent_events_session
      ON agent_events(session_id, sequence);

    CREATE INDEX IF NOT EXISTS idx_agent_events_parent
      ON agent_events(parent_event_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      stack TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

  `);

  // Stage 1: workspaces table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Stage 2: runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      parent_run_id TEXT REFERENCES runs(id),
      kind TEXT NOT NULL DEFAULT 'main',
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      ended_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id);
    CREATE INDEX IF NOT EXISTS idx_runs_parent ON runs(parent_run_id);
  `);

  // Stage 3: add run_id to agent_events (if not already present)
  if (!columnExists(db, "agent_events", "run_id")) {
    db.exec(`ALTER TABLE agent_events ADD COLUMN run_id TEXT;`);
  }

  // Stage 4: add workspace_id to sessions (if not already present)
  if (!columnExists(db, "sessions", "workspace_id")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN workspace_id TEXT;`);
  }

  // Stage 5: add title to sessions (if not already present)
  if (!columnExists(db, "sessions", "title")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN title TEXT;`);
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_events_run ON agent_events(run_id, sequence);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_events_run_events ON agent_events(run_id);`);

  // Migration: ensure default workspace exists
  const defaultWsId = "ws_default";
  const existing = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(defaultWsId) as any;
  if (!existing) {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT OR IGNORE INTO workspaces (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(defaultWsId, "default", process.cwd(), now, now);
  }

  // Migration: backfill workspace_id on sessions that lack it
  db.exec(`
    UPDATE sessions SET workspace_id = '${defaultWsId}'
    WHERE workspace_id IS NULL;
  `);

  // Migration: backfill runs from sessions (only if runs table is empty)
  const runCount = (db.prepare("SELECT COUNT(*) as c FROM runs").get() as any).c;
  if (runCount === 0) {
    db.exec(`
      INSERT INTO runs (id, session_id, parent_run_id, kind, status, started_at, ended_at)
      SELECT
        id,
        id,
        NULL,
        CASE
          WHEN json_extract(metadata, '$.isChildSession') = 1 THEN 'subagent'
          ELSE 'main'
        END,
        'completed',
        started_at,
        updated_at
      FROM sessions;
    `);
  }

  // Migration: backfill run_id on agent_events
  db.exec(`
    UPDATE agent_events SET run_id = session_id
    WHERE run_id IS NULL;
  `);

  return db;
}

export function getDb(): Database.Database {
  if (!_defaultDb) {
    _defaultDb = createDb();
  }
  return _defaultDb;
}

export function resetDb(): void {
  _defaultDb?.close();
  _defaultDb = null;
}

export const db = new Proxy({} as Database.Database, {
  get(_, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export function initDb() {
  getDb();
}

export function logError(message: string, stack?: string) {
  const db = getDb();
  const statement = db.prepare(`
    INSERT INTO error_logs (message, stack)
    VALUES (?, ?)
  `);
  statement.run(message, stack || null);
}

export function getSetting(key: string): string | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string) {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    key,
    value,
  );
}
