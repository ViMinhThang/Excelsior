import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, resetDb } from "../db/index.js";
import Database from "better-sqlite3";

let db: Database.Database;

describe("Database", () => {
  beforeAll(() => {
    db = createDb(":memory:");
  });

  afterAll(() => {
    db.close();
    resetDb();
  });

  describe("initDb", () => {
    it("creates all expected tables", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];

      const names = tables.map((t) => t.name);
      expect(names).toContain("sessions");
      expect(names).toContain("agent_events");
      expect(names).toContain("runs");
      expect(names).toContain("workspaces");
      expect(names).toContain("settings");
      expect(names).toContain("error_logs");
      expect(names).not.toContain("observation");
    });

    it("agent_events table has run_id column", () => {
      const columns = db
        .prepare("PRAGMA table_info(agent_events)")
        .all() as { name: string }[];
      const names = columns.map((c) => c.name);
      expect(names).toContain("id");
      expect(names).toContain("session_id");
      expect(names).toContain("run_id");
      expect(names).toContain("sequence");
    });

    it("sessions table has workspace_id column", () => {
      const columns = db
        .prepare("PRAGMA table_info(sessions)")
        .all() as { name: string }[];
      const names = columns.map((c) => c.name);
      expect(names).toContain("workspace_id");
      expect(names).toContain("title");
    });

    it("runs table has expected columns", () => {
      const columns = db
        .prepare("PRAGMA table_info(runs)")
        .all() as { name: string }[];
      const names = columns.map((c) => c.name);
      expect(names).toContain("id");
      expect(names).toContain("session_id");
      expect(names).toContain("parent_run_id");
      expect(names).toContain("kind");
      expect(names).toContain("status");
    });

    it("workspaces table exists with default workspace", () => {
      const row = db.prepare("SELECT id, name FROM workspaces WHERE id = 'ws_default'").get() as any;
      expect(row).toBeDefined();
      expect(row.name).toBe("default");
    });
  });

  describe("settings CRUD", () => {
    it("setSetting and getSetting work", () => {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("test_key", "test_value");
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("test_key") as { value: string };
      expect(row.value).toBe("test_value");
    });

    it("getSetting returns undefined for missing keys", () => {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("nonexistent") as { value: string } | undefined;
      expect(row).toBeUndefined();
    });
  });

  describe("schema integrity", () => {
    it("can insert and read a run", () => {
      db.prepare("INSERT INTO sessions (id, started_at, updated_at, metadata, workspace_id) VALUES (?, ?, ?, ?, ?)")
        .run("ses_integ", "2024-01-01", "2024-01-01", '{"userInput":"test"}', 'ws_default');
      db.prepare("INSERT INTO runs (id, session_id, parent_run_id, kind, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run("run_integ", "ses_integ", null, "main", "completed", "2024-01-01", "2024-01-01");
      const row = db.prepare("SELECT id, session_id, kind, status FROM runs WHERE id = ?").get("run_integ") as any;
      expect(row).toBeDefined();
      expect(row.session_id).toBe("ses_integ");
      expect(row.status).toBe("completed");
    });

    it("run_id on agent_events is queryable", () => {
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO agent_events (id, session_id, run_id, sequence, type, timestamp, data) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run("evt_integ", "ses_integ", "run_integ", 0, "user-input", now, '{"content":"test"}');
      const row = db.prepare("SELECT run_id FROM agent_events WHERE id = ?").get("evt_integ") as any;
      expect(row.run_id).toBe("run_integ");
    });
  });
});
