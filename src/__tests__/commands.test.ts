import { describe, it, expect } from "vitest";
import { handleCommand, commands } from "../tui/lib/commands.js";
import { CommandContext } from "../types.js";

describe("Commands", () => {
  function mockContext(): { ctx: CommandContext; called: Record<string, any[]> } {
    const called: Record<string, any[]> = {
      navigate: [],
      goBack: [],
      appendMessage: [],
      clearMessages: [],
      send: [],
      postComment: [],
      switchSession: [],
      createSession: [],
      deleteSession: [],
      renameSession: [],
      listSessions: [],
      currentSessionId: null,
    };
    const ctx: CommandContext = {
      navigate: (screen) => called.navigate.push(screen),
      goBack: () => called.goBack.push(true),
      appendMessage: (role, content) => called.appendMessage.push({ role, content }),
      clearMessages: () => called.clearMessages.push(true),
      send: (content) => called.send.push(content),
      postComment: async (prNumber, body) => {
        called.postComment.push({ prNumber, body });
        return `Posted comment to PR #${prNumber}`;
      },
      switchSession: (id) => called.switchSession.push(id),
      createSession: (title) => called.createSession.push(title),
      deleteSession: (id) => called.deleteSession.push(id),
      renameSession: (id, title) => called.renameSession.push({ id, title }),
      listSessions: () => { called.listSessions.push(true); return []; },
      currentSessionId: null,
    };
    return { ctx, called };
  }

  describe("command list", () => {
    it("has expected commands", () => {
      const names = commands.map((c) => c.name);
      expect(names).toContain("help");
      expect(names).toContain("clear");
      expect(names).toContain("reset");
      expect(names).toContain("settings");
      expect(names).toContain("review");
      expect(names).toContain("review-post");
      expect(names).toContain("session");
    });
  });

  describe("handleCommand", () => {
    it("returns false for non-command input", async () => {
      const { ctx } = mockContext();
      const result = await handleCommand("hello world", ctx);
      expect(result).toBe(false);
    });

    it("parses /help and appends system message", async () => {
      const { ctx, called } = mockContext();
      const result = await handleCommand("/help", ctx);
      expect(result).toBe(true);
      expect(called.appendMessage.length).toBe(1);
      expect(called.appendMessage[0].role).toBe("system");
      expect(called.appendMessage[0].content).toContain("/help");
    });

    it("/clear clears messages and appends confirmation", async () => {
      const { ctx, called } = mockContext();
      await handleCommand("/clear", ctx);
      expect(called.clearMessages.length).toBe(1);
      expect(called.appendMessage[0].content).toContain("cleared");
    });

    it("/settings navigates to settings screen", async () => {
      const { ctx, called } = mockContext();
      await handleCommand("/settings", ctx);
      expect(called.navigate).toEqual(["settings"]);
    });

    it("/review without number shows usage", async () => {
      const { ctx, called } = mockContext();
      await handleCommand("/review", ctx);
      expect(called.appendMessage.length).toBe(1);
      expect(called.appendMessage[0].content).toContain("Usage:");
    });

    it("/review with number fetches diff or shows error", async () => {
      const { ctx, called } = mockContext();
      await handleCommand("/review 42", ctx);
      expect(called.appendMessage.length).toBeGreaterThanOrEqual(2);
      // First message confirms fetch attempt
      expect(called.appendMessage[0].content).toContain("Fetching PR #42");
    });

    it("/review-post without number shows usage", async () => {
      const { ctx, called } = mockContext();
      await handleCommand("/review-post", ctx);
      expect(called.appendMessage[0].content).toContain("Usage:");
    });

    it("/review-post with number and body posts comment", async () => {
      const { ctx, called } = mockContext();
      await handleCommand('/review-post 42 "Looks good"', ctx);
      expect(called.postComment.length).toBe(1);
      expect(called.postComment[0].prNumber).toBe(42);
    });

    it("unknown command appends system error", async () => {
      const { ctx, called } = mockContext();
      const result = await handleCommand("/nonexistent", ctx);
      expect(result).toBe(true);
      expect(called.appendMessage[0].content).toContain("Unknown command");
    });

    it("parses command with args", async () => {
      const { ctx } = mockContext();
      const result = await handleCommand("/help extra args", ctx);
      expect(result).toBe(true);
    });
  });
});
