import { describe, expect, it } from "vitest";
import { ProjectionPolicy } from "@excelsior/agent-host/testing/application";
import { PERSISTENCE_ERROR, type AnyAgentEvent } from "@excelsior/agent-host/testing/runtime";
import { makeEvent } from "./projection/helpers.js";

function projectHistory(events: readonly AnyAgentEvent[]) {
  return new ProjectionPolicy().project({
    liveEvents: [],
    persistedEvents: [...events],
    childRuns: new Map(),
  }).aiHistory;
}

describe("AI history projection", () => {
  it("converts user and assistant events to messages", () => {
    const events: AnyAgentEvent[] = [
      makeEvent({ type: "user-input", data: { content: "hi" } }),
      makeEvent({ type: "text-delta", data: { delta: "Hello" } }),
      makeEvent({ type: "text-delta", data: { delta: " there" } }),
    ];
    const history = projectHistory(events);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ role: "user", content: "hi" });
    expect(history[1]).toMatchObject({ role: "assistant", content: "Hello there" });
  });

  it("flushes pending assistant text into the projected history", () => {
    const history = projectHistory([
      makeEvent({ type: "user-input", data: { content: "hi" } }),
      makeEvent({ type: "text-delta", data: { delta: "Hello" } }),
    ]);

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
    const history = projectHistory(events);
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
    const history = projectHistory(events);
    expect(history[0].content).toContain("[Error]");
  });

  it("ignores persistence errors in AI history", () => {
    const history = projectHistory([
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

  it("resets and summarizes history when encountering a HISTORY_COMPACTED event", () => {
    const events: AnyAgentEvent[] = [
      makeEvent({ type: "user-input", data: { content: "old message 1" } }),
      makeEvent({ type: "text-delta", data: { delta: "old response 1" } }),
      makeEvent({
        type: "history-compacted",
        data: {
          summary: "This is a summary of old messages.",
          compactedEventCount: 2,
          triggerMode: "manual",
        },
      }),
      makeEvent({ type: "user-input", data: { content: "new message" } }),
    ];

    const history = projectHistory(events);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("This is a summary of old messages."),
    });
    expect(history[1]).toMatchObject({
      role: "user",
      content: "new message",
    });
  });
});
