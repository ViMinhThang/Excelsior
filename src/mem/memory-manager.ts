import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export interface Observation {
  id?: number;
  agent: string;
  timestamp: string;
  message: string;
}

export class MemoryManager {
  private db: Database.Database;
  private readonly dbPath: string;
  public readonly workspaceRoot: string;
  private fallbackMode: "ACT" | "PLAN" = "ACT";

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.dbPath = path.join(workspaceRoot, ".excelsior", "memory.db");

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        message TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      INSERT OR IGNORE INTO session_state (key, value) VALUES ('mode', 'ACT');
    `);
  }

  getMode(): "ACT" | "PLAN" {
    const row = this.db
      .prepare("SELECT value FROM session_state WHERE key = 'mode'")
      .get() as { value: string };
    return (row?.value as "ACT" | "PLAN") || "ACT";
  }

  setMode(mode: "ACT" | "PLAN") {
    this.fallbackMode = mode;
    this.db
      .prepare(
        "INSERT OR REPLACE INTO session_state (key, value) VALUES ('mode', ?)",
      )
      .run(mode);
    this.addObservation("System", `Changed mode to ${mode}`);
  }

  addObservation(agent: string, message: string) {
    const stmt = this.db.prepare(
      "INSERT INTO observations (agent, message) VALUES (?, ?)",
    );
    stmt.run(agent, message);
  }

  getRecentObservations(limit = 10): string[] {
    const stmt = this.db.prepare(
      "SELECT agent, timestamp, message FROM observations ORDER BY timestamp DESC LIMIT ?",
    );
    const rows = stmt.all(limit) as Observation[];

    return rows
      .reverse()
      .map((obs) => `[${obs.agent}] (${obs.timestamp}): ${obs.message}`);
  }

  searchObservations(query: string, limit = 5): string[] {
    const stmt = this.db.prepare(
      "SELECT agent, timestamp, message FROM observations WHERE message LIKE ? ORDER BY timestamp DESC LIMIT ?",
    );
    const rows = stmt.all(`%${query}%`, limit) as Observation[];

    return rows.map(
      (obs) => `[${obs.agent}] (${obs.timestamp}): ${obs.message}`,
    );
  }

  clear() {
    this.db.exec("DELETE FROM observations");
  }

  close() {
    this.db.close();
  }
}

export function createMemoryManager(workspaceRoot: string): MemoryManager {
  return new MemoryManager(workspaceRoot);
}
