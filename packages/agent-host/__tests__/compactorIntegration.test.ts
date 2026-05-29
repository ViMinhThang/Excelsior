import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  AgentStateStore,
  ProjectionPolicy,
  TurnLifecycle,
  AgentApplication,
} from "@excelsior/agent-host/testing/application";
import { makeEvent } from "./projection/helpers.js";
import { getSetting, setSetting } from "@excelsior/agent-storage";
import { estimateTokens } from "../src/application/context/tokenizer.js";

// Mock runLocalCompaction
vi.mock("../src/application/context/compactor.js", () => ({
  SUMMARIZATION_PROMPT: "Summary prompt",
  shouldKeepCompactedHistoryItem: () => true,
  runLocalCompaction: vi.fn().mockResolvedValue("Integrated bullet-point conversation summary."),
}));

describe("Compaction Integration & Auto-Compaction", () => {
  beforeEach(() => {
    // Reset settings
    setSetting("AUTO_COMPACT_ENABLED", "true");
    setSetting("MODEL_AUTO_COMPACT_TOKEN_LIMIT", "253000");
    setSetting("MODEL_AUTO_COMPACT_TOKEN_LIMIT_SCOPE", "Total");
  });

  it("calculates mixed-language tokens precisely based on user conversion ratios", () => {
    // 1 English char = 0.3 tokens, 1 CJK/Chinese char = 0.6 tokens
    // "hello" -> 5 * 0.3 = 1.5 -> ceil(1.5) = 2
    expect(estimateTokens("hello")).toBe(2);
    // "你好" -> 2 * 0.6 = 1.2 -> ceil(1.2) = 2
    expect(estimateTokens("你好")).toBe(2);
    // "hello你好" -> 5 * 0.3 + 2 * 0.6 = 2.7 -> ceil(2.7) = 3
    expect(estimateTokens("hello你好")).toBe(3);
  });

  it("collapses projected history to a single system summary message upon HISTORY_COMPACTED event", () => {
    const policy = new ProjectionPolicy();
    const liveEvents = [
      makeEvent({ type: "user-input", data: { content: "old prompt 1" } }),
      makeEvent({
        type: "history-compacted",
        data: {
          summary: "Summary of old conversation.",
          compactedEventCount: 1,
          triggerMode: "manual",
        },
      }),
      makeEvent({ type: "user-input", data: { content: "new prompt" } }),
    ];

    const result = policy.project({
      liveEvents,
      persistedEvents: [],
      childRuns: new Map(),
    });

    expect(result.aiHistory).toHaveLength(2);
    expect(result.aiHistory[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("Summary of old conversation."),
    });
    expect(result.aiHistory[1]).toMatchObject({
      role: "user",
      content: "new prompt",
    });
  });

  it("automatically triggers compaction when token count exceeds the configured limit", async () => {
    // Set a very low limit to trigger auto compaction
    setSetting("MODEL_AUTO_COMPACT_TOKEN_LIMIT", "2"); // 2 tokens

    const state = new AgentStateStore(
      {
        workspace: { id: "ws_test", name: "Test Workspace", rootPath: "/tmp" },
      },
      new ProjectionPolicy()
    );

    // Populate history with enough text to exceed 2 tokens
    state.setPersistedEvents([
      makeEvent({ type: "user-input", data: { content: "this text is long and will exceed the limit" } }),
    ]);

    const recorder = {
      recordEvent: vi.fn(),
      recordTurnComplete: async () => {},
      loadCompletedEvents: async (_sessionId: string) => [
        makeEvent({ type: "user-input", data: { content: "this text is long and will exceed the limit" } }),
        makeEvent({
          type: "history-compacted",
          data: {
            summary: "Integrated bullet-point conversation summary.",
            compactedEventCount: 1,
            triggerMode: "auto",
          },
        }),
      ],
      loadRawEvents: async (_sessionId: string) => [],
      getLastCompletedTurn: async (_sessionId: string) => null,
      dropLastCompletedTurn: async (_sessionId: string) => ({ dropped: true, removedEvents: 0 }),
      deleteSessionEvents: async (_sessionId: string) => {},
      deleteAllSessionEvents: async () => {},
    };

    const lifecycle = new TurnLifecycle({
      state,
      projection: new ProjectionPolicy(),
      recorder: recorder as any,
      subAgentEvents: { emit: () => {}, on: () => () => {} },
      sessionStorage: {
        getCurrentSessionId: () => "ses_test",
        getWorkspaceId: () => "ws_test",
        getWorkspace: () => ({ id: "ws_test", name: "Test workspace", rootPath: "/tmp" }),
        ensureSession: () => "ses_test",
        createSession: () => ({ id: "ses_test", startedAt: "", updatedAt: "", metadata: { userInput: "" } }),
        switchSession: () => {},
        deleteSession: async () => {},
        deleteAllSessions: async () => {},
        renameSession: () => {},
        listSessions: () => [],
        loadCurrentSessionEvents: async () => [],
        getLastCompletedTurn: async () => null,
        trimLastCompletedTurn: async () => ({ dropped: true, removedEvents: 0 }),
        recordTurnComplete: async () => {},
      },
      appendFinalEvents: () => {},
      compactCurrentSession: async (triggerMode) => {
        const summary = "Integrated bullet-point conversation summary.";
        const event = makeEvent({
          type: "history-compacted",
          data: {
            summary,
            compactedEventCount: 1,
            triggerMode,
          },
        });
        await recorder.recordEvent("ses_test", event);
        state.setPersistedEvents(await recorder.loadCompletedEvents("ses_test"));
      },
      dependencies: {
        agentFactory: { create: () => ({ stream: async () => {} }) },
      },
    });

    await lifecycle.startUserTurn({
      content: "next user prompt",
      sessionId: "ses_test",
      workspaceRoot: "/tmp",
      mode: "act",
    });

    // Verify recorder.recordEvent was called with HISTORY_COMPACTED
    expect(recorder.recordEvent).toHaveBeenCalledWith(
      "ses_test",
      expect.objectContaining({
        type: "history-compacted",
        data: expect.objectContaining({
          triggerMode: "auto",
          summary: "Integrated bullet-point conversation summary.",
        }),
      })
    );
  });
});
