import Database from "better-sqlite3";
import { join } from "path";

const DEFAULT_DB_PATH = join(process.cwd(), "data", "index.db");

let _defaultDb: Database.Database | null = null;

export function createDb(dbPath?: string): Database.Database {
  const path = dbPath ?? DEFAULT_DB_PATH;
  const db = new Database(path);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS observation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

  try {
    db.exec("ALTER TABLE observation ADD COLUMN message_id TEXT");
  } catch {
    // column already exists — ignore
  }

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

/**
 * Lazy database proxy — allows module-level import of `db` without
 * requiring explicit initialization. All property accesses are forwarded
 * to the singleton returned by `getDb()`, which creates the DB on first use.
 *
 * Usage: `import { db } from "./db/index.js"` — works like a regular Database instance.
 */
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
