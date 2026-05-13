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
      expect(names).toContain("workspaces");
      expect(names).toContain("settings");
      expect(names).not.toContain("agent_events");
      expect(names).not.toContain("runs");
    });

    it("sessions table has workspace_id and title columns", () => {
      const columns = db
        .prepare("PRAGMA table_info(sessions)")
        .all() as { name: string }[];
      const names = columns.map((c) => c.name);
      expect(names).toContain("workspace_id");
      expect(names).toContain("title");
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
});
