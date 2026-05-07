import { describe, it, expect } from "vitest";
import { handleCommand, commands } from "../agent/commands/registry.js";
import { CommandContext } from "../types.js";

describe("Commands", () => {
  function mockContext(): { ctx: CommandContext; called: Record<string, any[]> } {
    const called: Record<string, any[]> = {
      navigate: [],
      goBack: [],
      appendMessage: [],
      clearMessages: [],
    };
    const ctx: CommandContext = {
      navigate: (screen) => called.navigate.push(screen),
      goBack: () => called.goBack.push(true),
      appendMessage: (role, content) => called.appendMessage.push({ role, content }),
      clearMessages: () => called.clearMessages.push(true),
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

    it("/review navigates to review screen", async () => {
      const { ctx, called } = mockContext();
      await handleCommand("/review", ctx);
      expect(called.navigate).toEqual(["review"]);
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
