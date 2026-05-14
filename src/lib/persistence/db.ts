import Database from "better-sqlite3";
import { join } from "path";

function getDefaultDbPath(): string {
  return process.env.EXCELSIOR_DB_PATH ?? join(process.cwd(), "data", "index.db");
}

let _defaultDb: Database.Database | null = null;

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

export function createDb(dbPath?: string): Database.Database {
  const path = dbPath ?? getDefaultDbPath();
  const db = new Database(path);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      stack TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add workspace_id to sessions (if not already present)
  if (!columnExists(db, "sessions", "workspace_id")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN workspace_id TEXT;`);
  }

  // Migration: add title to sessions (if not already present)
  if (!columnExists(db, "sessions", "title")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN title TEXT;`);
  }

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
  db.prepare("UPDATE sessions SET workspace_id = ? WHERE workspace_id IS NULL").run(defaultWsId);

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
