import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, resetDb } from "../db/index.js";
import { persistMessage, loadMessages, getMessageCount } from "../tui/lib/chatPersistence.js";
import { Message } from "../types.js";
import Database from "better-sqlite3";

let db: Database.Database;

describe("chatPersistence", () => {
  beforeAll(() => {
    db = createDb(":memory:");
  });

  afterAll(() => {
    db.close();
    resetDb();
  });

  describe("persistMessage and loadMessages", () => {
    it("round-trips a user message with app-generated ID", () => {
      const msg: Message = {
        id: "msg_user_1",
        role: "user",
        content: "Hello, agent!",
        timestamp: new Date().toISOString(),
      };
      persistMessage(msg, db);

      const loaded = loadMessages(10, 0, db);
      const found = loaded.find((m) => m.id === "msg_user_1");
      expect(found).toBeDefined();
      expect(found!.role).toBe("user");
      expect(found!.content).toBe("Hello, agent!");
    });

    it("round-trips an assistant message", () => {
      const msg: Message = {
        id: "msg_asst_1",
        role: "assistant",
        content: "Here is the code you requested.",
        timestamp: new Date().toISOString(),
      };
      persistMessage(msg, db);

      const loaded = loadMessages(10, 0, db);
      const assistant = loaded.find((m) => m.id === "msg_asst_1");
      expect(assistant).toBeDefined();
      expect(assistant!.role).toBe("assistant");
    });

    it("round-trips a tool-call message with metadata", () => {
      const msg: Message = {
        id: "msg_tool_1",
        role: "tool-call",
        content: '{"path":"test.txt"}',
        timestamp: new Date().toISOString(),
        toolCall: {
          toolName: "readFile",
          toolArgs: '{"path":"test.txt"}',
          toolCallId: "call_abc",
          status: "completed",
        },
      };
      persistMessage(msg, db);

      const loaded = loadMessages(10, 0, db);
      const tool = loaded.find((m) => m.id === "msg_tool_1");
      expect(tool).toBeDefined();
      expect(tool!.role).toBe("tool-call");
      expect(tool!.toolCall).toBeDefined();
      expect(tool!.toolCall!.toolName).toBe("readFile");
      expect(tool!.toolCall!.status).toBe("completed");
    });

    it("skips empty non-assistant messages", () => {
      const msg: Message = {
        id: "msg_empty",
        role: "user",
        content: "",
        timestamp: new Date().toISOString(),
      };
      persistMessage(msg, db);

      const loaded = loadMessages(10, 0, db);
      const found = loaded.find((m) => m.id === "msg_empty");
      expect(found).toBeUndefined();
    });
  });

  describe("loadMessages with pagination", () => {
    it("returns messages in chronological order (oldest first)", async () => {
      for (let i = 0; i < 5; i++) {
        const msg: Message = {
          id: `msg_${i}`,
          role: "user",
          content: `Message ${i}`,
          timestamp: new Date().toISOString(),
        };
        persistMessage(msg, db);
        await new Promise((r) => setTimeout(r, 10));
      }

      const loaded = loadMessages(50, 0, db);
      const five = loaded.filter((m) => /^msg_\d+$/.test(m.id));
      const contents = five.map((m) => m.content);
      expect(contents.slice(0, 5)).toEqual([
        "Message 0",
        "Message 1",
        "Message 2",
        "Message 3",
        "Message 4",
      ]);
    });

    it("supports limit and offset", () => {
      const loaded = loadMessages(2, 0, db);
      expect(loaded.length).toBe(2);
    });

    it("supports offset to skip messages", () => {
      const loaded = loadMessages(2, 2, db);
      expect(loaded.length).toBe(2);
    });
  });

  describe("getMessageCount", () => {
    it("returns the total number of messages", () => {
      const count = getMessageCount(db);
      expect(count).toBeGreaterThanOrEqual(5);
    });
  });

  describe("reconstructed IDs fall back to DB id for legacy rows", () => {
    it("uses DB row id when message_id is null", () => {
      db.prepare("INSERT INTO observation (role, content) VALUES (?, ?)").run("system", "legacy row");
      const loaded = loadMessages(50, 0, db);
      const legacy = loaded.find((m) => m.content === "legacy row");
      expect(legacy).toBeDefined();
      expect(legacy!.id).toMatch(/^\d+$/);
    });
  });
});
