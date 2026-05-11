import Database from "better-sqlite3";
import { join } from "path";

const DEFAULT_DB_PATH = join(process.cwd(), "data", "index.db");

let _defaultDb: Database.Database | null = null;

export function createDb(dbPath?: string): Database.Database {
  const path = dbPath ?? DEFAULT_DB_PATH;
  const db = new Database(path);
  db.pragma("journal_mode = WAL");

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

    DROP TABLE IF EXISTS observation;
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
