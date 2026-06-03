import { describe, expect, it } from "vitest";
import {
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  makeHarnessEvent,
  type AnyHarnessEvent,
  type HarnessEventDataMap,
  type HarnessEventType,
} from "../src/events.js";
import { projectEventsToDisplayBlocks, projectEventsToMessages } from "../src/projection.js";

function event<T extends HarnessEventType>(
  sequence: number,
  type: T,
  data: HarnessEventDataMap[T],
): AnyHarnessEvent {
  return makeHarnessEvent({
    workspaceId: "ws_test",
    sessionId: "ses_test",
    runId: "run_test",
    turnId: "turn_test",
    sequence,
    type,
    data,
  }) as AnyHarnessEvent;
}

describe("harness projector", () => {
  it("projects user and streaming assistant messages from message events", () => {
    const events = [
      event(1, MESSAGE_END, {
        message: { id: "msg_user", role: "user", content: "shown", modelContent: "model" },
      }),
      event(2, MESSAGE_START, {
        message: { id: "msg_assistant", role: "assistant", content: "" },
      }),
      event(3, MESSAGE_UPDATE, {
        messageId: "msg_assistant",
        role: "assistant",
        delta: "hello",
        content: "hello",
      }),
      event(4, MESSAGE_END, {
        message: { id: "msg_assistant", role: "assistant", content: "hello" },
      }),
    ];

    expect(projectEventsToDisplayBlocks(events)).toMatchObject([
      { type: "user", content: "shown", isFrozen: true },
      { type: "assistant", content: "hello", isFrozen: true },
    ]);
    expect(projectEventsToMessages(events)).toMatchObject([
      { role: "user", content: "model" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("projects tool and sub-agent lifecycle events into display blocks", () => {
    const events = [
      event(1, TOOL_EXECUTION_START, {
        toolCallId: "tool_1",
        toolName: "runCommand",
        toolArgs: "{\"command\":\"npm\"}",
      }),
      event(2, TOOL_EXECUTION_END, {
        toolCallId: "tool_1",
        toolName: "runCommand",
        toolArgs: "{\"command\":\"npm\"}",
        result: "ok",
        isError: false,
      }),
      event(3, TOOL_EXECUTION_START, {
        toolCallId: "tool_2",
        toolName: "spawnSubAgent",
        toolArgs: "{\"role\":\"Reviewer\"}",
      }),
      event(4, TOOL_EXECUTION_END, {
        toolCallId: "tool_2",
        toolName: "spawnSubAgent",
        toolArgs: "{\"role\":\"Reviewer\"}",
        result: "finding",
        isError: false,
      }),
    ];

    expect(projectEventsToDisplayBlocks(events)).toMatchObject([
      { type: "tool-call", toolName: "runCommand", status: "completed", content: "ok" },
      { type: "sub-agent", role: "Reviewer", state: { status: "done", latestLine: "finding" } },
    ]);
  });
});
