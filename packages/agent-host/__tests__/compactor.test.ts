import { describe, expect, it, vi } from "vitest";
import { shouldKeepCompactedHistoryItem, runLocalCompaction } from "../src/application/context/compactor.js";
import type { AgentMessage } from "@excelsior/core";

// Mock generateText from 'ai'
vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "Mocked bullet-point conversation summary.",
  }),
}));

// Mock @ai-sdk/deepseek
vi.mock("@ai-sdk/deepseek", () => ({
  createDeepSeek: vi.fn().mockReturnValue(vi.fn()),
}));

describe("Compaction Engine", () => {
  describe("shouldKeepCompactedHistoryItem", () => {
    it("keeps user and assistant messages", () => {
      const userMsg: AgentMessage = { role: "user", content: "hello" };
      const assistantMsg: AgentMessage = { role: "assistant", content: "hi" };
      expect(shouldKeepCompactedHistoryItem(userMsg)).toBe(true);
      expect(shouldKeepCompactedHistoryItem(assistantMsg)).toBe(true);
    });

    it("drops normal system messages", () => {
      const systemMsg: AgentMessage = { role: "system", content: "You are a helpful assistant." };
      expect(shouldKeepCompactedHistoryItem(systemMsg)).toBe(false);
    });

    it("retains previous compaction summary system messages", () => {
      const compactionSummaryMsg: AgentMessage = {
        role: "system",
        content: "Previous conversation compacted for context. Summary: earlier stuff.",
      };
      expect(shouldKeepCompactedHistoryItem(compactionSummaryMsg)).toBe(true);
    });
  });

  describe("runLocalCompaction", () => {
    it("runs summarization correctly using the mocked model and returns the summary", async () => {
      const history: AgentMessage[] = [
        { role: "user", content: "User prompt" },
        { role: "assistant", content: "Assistant response" },
      ];

      const summary = await runLocalCompaction(history, { apiKey: "fake-api-key" });
      expect(summary).toBe("Mocked bullet-point conversation summary.");
    });
  });
});
