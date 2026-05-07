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
    it("creates observation, settings, and error_logs tables", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];

      const names = tables.map((t) => t.name);
      expect(names).toContain("observation");
      expect(names).toContain("settings");
      expect(names).toContain("error_logs");
    });

    it("observation table has a message_id column", () => {
      const columns = db
        .prepare("PRAGMA table_info(observation)")
        .all() as { name: string }[];
      const names = columns.map((c) => c.name);
      expect(names).toContain("message_id");
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

    it("setSetting overwrites existing keys", () => {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("dup_key", "first");
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("dup_key", "second");
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("dup_key") as { value: string };
      expect(row.value).toBe("second");
    });
  });

  describe("observation table", () => {
    it("stores a message with message_id", () => {
      db.prepare("INSERT INTO observation (role, content, message_id) VALUES (?, ?, ?)").run("user", "hello", "msg_abc123");
      const row = db.prepare("SELECT * FROM observation WHERE message_id = ?").get("msg_abc123") as any;
      expect(row).toBeDefined();
      expect(row.role).toBe("user");
      expect(row.content).toBe("hello");
      expect(row.message_id).toBe("msg_abc123");
    });

    it("allows null message_id for legacy rows", () => {
      db.prepare("INSERT INTO observation (role, content) VALUES (?, ?)").run("assistant", "legacy message");
      const row = db.prepare("SELECT * FROM observation WHERE content = ?").get("legacy message") as any;
      expect(row.message_id).toBeNull();
      expect(row.id).toBeGreaterThan(0);
    });
  });

  describe("logError", () => {
    it("stores error logs", () => {
      db.prepare("INSERT INTO error_logs (message, stack) VALUES (?, ?)").run("test error", "at test.js:1");
      const rows = db.prepare("SELECT * FROM error_logs WHERE message = ?").all("test error") as any[];
      expect(rows.length).toBe(1);
      expect(rows[0].stack).toBe("at test.js:1");
      expect(rows[0].timestamp).toBeDefined();
    });
  });
});
