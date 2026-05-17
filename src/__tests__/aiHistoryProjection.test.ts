import { describe, expect, it } from "vitest";
import {
  AI_HISTORY_MODEL,
  createAIHistoryProjectionState,
  finalizeAIHistoryProjection,
  projectEventsToAIMessages,
} from "@excelsior/agent-host/testing/projection";
import { PERSISTENCE_ERROR, type AnyAgentEvent } from "@excelsior/agent-host/testing/runtime";
import { makeEvent } from "./projection/helpers.js";

describe("AI history projection", () => {
  it("converts user and assistant events to messages", () => {
    const events: AnyAgentEvent[] = [
      makeEvent({ type: "user-input", data: { content: "hi" } }),
      makeEvent({ type: "text-delta", data: { delta: "Hello" } }),
      makeEvent({ type: "text-delta", data: { delta: " there" } }),
    ];
    const history = projectEventsToAIMessages(events);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ role: "user", content: "hi" });
    expect(history[1]).toMatchObject({ role: "assistant", content: "Hello there" });
  });

  it("flushes pending assistant text without mutating the message array state", () => {
    const initial = createAIHistoryProjectionState();
    const withUser = AI_HISTORY_MODEL.apply(initial, makeEvent({
      type: "user-input",
      data: { content: "hi" },
    }));
    const withPendingAssistant = AI_HISTORY_MODEL.apply(withUser, makeEvent({
      type: "text-delta",
      data: { delta: "Hello" },
    }));

    const history = finalizeAIHistoryProjection(withPendingAssistant);

    expect(initial.messages).toEqual([]);
    expect(withUser.messages).not.toBe(initial.messages);
    expect(withPendingAssistant.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(history).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello" },
    ]);
  });

  it("includes tool results in history", () => {
    const events: AnyAgentEvent[] = [
      makeEvent({ type: "user-input", data: { content: "run test" } }),
      makeEvent({
        type: "tool-call-end",
        data: { toolCallId: "tc1", result: "passed", status: "success", toolName: "runCommand", toolArgs: "{}" },
      }),
    ];
    const history = projectEventsToAIMessages(events);
    expect(history).toHaveLength(2);
    expect(history[1].content).toContain("[Tool: runCommand");
    expect(history[1].content).toContain("[Completed]");
  });

  it("marks error tool results", () => {
    const events: AnyAgentEvent[] = [
      makeEvent({
        type: "tool-call-end",
        data: { toolCallId: "tc1", result: "[Error] failed", status: "error", toolName: "runCommand", toolArgs: "{}" },
      }),
    ];
    const history = projectEventsToAIMessages(events);
    expect(history[0].content).toContain("[Error]");
  });

  it("ignores persistence errors in AI history", () => {
    const history = projectEventsToAIMessages([
      makeEvent({
        type: PERSISTENCE_ERROR,
        data: {
          message: "Failed to persist run event: disk full",
          failedEventType: "text-delta",
        },
      }),
    ]);

    expect(history).toEqual([]);
  });
});
