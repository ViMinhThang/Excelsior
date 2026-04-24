import Database from "better-sqlite3";
import path from "node:path";
import { promises as fs } from "node:fs";

export interface Observation {
  id?: number;
  agent: string;
  timestamp: string;
  message: string;
}

export class MemoryManager {
  private db: Database.Database | null = null;
  private readonly dbPath: string;

  constructor(workspaceRoot: string) {
    this.dbPath = path.join(workspaceRoot, ".excelsior", "memory.db");
  }

  /**
   * Initializes the database and creates the necessary tables.
   */
  async init() {
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });

    this.db = new Database(this.dbPath);
    
    // Create the observations table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        message TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        last_modified DATETIME,
        hash TEXT,
        summary TEXT
      );
    `);
  }

  addObservation(agent: string, message: string) {
    if (!this.db) throw new Error("Database not initialized. Call init() first.");
    
    const stmt = this.db.prepare("INSERT INTO observations (agent, message) VALUES (?, ?)");
    stmt.run(agent, message);
  }

  getRecentObservations(limit = 10): string[] {
    if (!this.db) return [];
    
    const stmt = this.db.prepare("SELECT agent, timestamp, message FROM observations ORDER BY timestamp DESC LIMIT ?");
    const rows = stmt.all(limit) as Observation[];
    
    // We reverse them so they are in chronological order for the prompt
    return rows
      .reverse()
      .map(obs => `[${obs.agent}] (${obs.timestamp}): ${obs.message}`);
  }

  searchObservations(query: string, limit = 5): string[] {
    if (!this.db) return [];
    
    const stmt = this.db.prepare("SELECT agent, timestamp, message FROM observations WHERE message LIKE ? ORDER BY timestamp DESC LIMIT ?");
    const rows = stmt.all(`%${query}%`, limit) as Observation[];
    
    return rows.map(obs => `[${obs.agent}] (${obs.timestamp}): ${obs.message}`);
  }

  clear() {
    if (!this.db) return;
    this.db.exec("DELETE FROM observations");
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Global instance for convenience
export const globalMemory = new MemoryManager(process.cwd());
