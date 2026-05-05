import Database from "better-sqlite3";
import { join } from "path";

const DB_PATH = join(process.cwd(), "data", "index.db");

export const db = new Database(DB_PATH);

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS observation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
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
}

export function logError(message: string, stack?: string) {
  const statement = db.prepare(`
    INSERT INTO error_logs (message, stack)
    VALUES (?, ?)
  `);
  statement.run(message, stack || null);
}

export function logObservation(
  role: "user" | "assistant" | "tool" | "system",
  content: string,
) {
  const statement = db.prepare(`
    INSERT INTO observation (role, content)
    VALUES (?, ?)
  `);
  statement.run(role, content);
}
export function getSetting(key: string): string | undefined {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    key,
    value,
  );
}
