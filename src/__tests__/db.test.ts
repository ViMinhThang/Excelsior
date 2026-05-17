import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  createDb,
  loadSessionsByWorkspace,
  persistSession,
  resetDb,
} from "@excelsior/agent-host/testing/persistence";
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
      const row = db.prepare("SELECT id, name FROM workspaces WHERE id = 'ws_default'").get() as { id: string; name: string } | undefined;
      expect(row).toBeDefined();
      expect(row.name).toBe("default");
    });

    it("creates the persistence directory when opening a file database", async () => {
      const root = await mkdtemp(join(tmpdir(), "excelsior-db-"));
      const dbPath = join(root, "missing", "data", "index.db");
      const fileDb = createDb(dbPath);

      fileDb.close();
      expect(existsSync(join(root, "missing", "data"))).toBe(true);

      await rm(root, { recursive: true, force: true });
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

  describe("session metadata", () => {
    it("preserves an existing title when later persistence omits title", () => {
      persistSession({
        id: "ses_title_preserve",
        startedAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        metadata: { userInput: "first" },
        workspaceId: "ws_default",
        title: "first prompt",
      }, db);

      persistSession({
        id: "ses_title_preserve",
        startedAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:01:00.000Z",
        metadata: { userInput: "second" },
        workspaceId: "ws_default",
      }, db);

      const saved = loadSessionsByWorkspace("ws_default", db)
        .find((session) => session.id === "ses_title_preserve");
      expect(saved?.title).toBe("first prompt");
    });
  });
});
