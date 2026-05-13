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
    it("creates sessions, agent_events, settings, and error_logs tables", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];

      const names = tables.map((t) => t.name);
      expect(names).toContain("sessions");
      expect(names).toContain("agent_events");
      expect(names).toContain("settings");
      expect(names).toContain("error_logs");
      expect(names).not.toContain("observation");
    });

    it("agent_events table has expected columns", () => {
      const columns = db
        .prepare("PRAGMA table_info(agent_events)")
        .all() as { name: string }[];
      const names = columns.map((c) => c.name);
      expect(names).toContain("id");
      expect(names).toContain("session_id");
      expect(names).toContain("sequence");
      expect(names).toContain("type");
      expect(names).toContain("timestamp");
      expect(names).toContain("data");
      expect(names).toContain("parent_event_id");
      expect(names).toContain("related_tool_call_id");
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

  describe("sessions and agent_events tables", () => {
    it("stores a session", () => {
      db.prepare("INSERT INTO sessions (id, started_at, updated_at, metadata) VALUES (?, ?, ?, ?)").run("ses_1", "2024-01-01", "2024-01-01", '{"userInput":"hello"}');
      const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get("ses_1") as any;
      expect(row).toBeDefined();
      expect(row.id).toBe("ses_1");
      expect(row.metadata).toBe('{"userInput":"hello"}');
    });

    it("stores events with session reference", () => {
      db.prepare(
        "INSERT INTO agent_events (id, session_id, sequence, type, timestamp, data, parent_event_id, related_tool_call_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run("evt_1", "ses_1", 0, "user-input", "2024-01-01T00:00:00Z", '{"content":"hello"}', null, null);
      const row = db.prepare("SELECT * FROM agent_events WHERE id = ?").get("evt_1") as any;
      expect(row).toBeDefined();
      expect(row.session_id).toBe("ses_1");
      expect(row.type).toBe("user-input");
      expect(row.data).toBe('{"content":"hello"}');
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
