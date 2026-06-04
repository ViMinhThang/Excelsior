import { describe, expect, it, vi } from "vitest";
import {
  ERROR,
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  REASONING_END,
  SUB_AGENT_EVENT,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  makeHarnessEvent,
  type AnyHarnessEvent,
  type HarnessEventDataMap,
  type HarnessEventType,
} from "../src/events.js";
import { AssistantStateMachine } from "../src/context/AssistantStateMachine.js";
import {
  ProjectionCache,
  projectEventsToDisplayBlocks,
  projectEventsToMessages,
} from "../src/projection.js";

function event<T extends HarnessEventType>(
  sequence: number,
  type: T,
  data: HarnessEventDataMap[T],
  options: { runId?: string; turnId?: string } = {},
): AnyHarnessEvent {
  return makeHarnessEvent({
    workspaceId: "ws_test",
    sessionId: "ses_test",
    runId: options.runId ?? "run_test",
    turnId: options.turnId ?? "turn_test",
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

  it("projects live spawned sub-agent progress into nested output parts", () => {
    const events = [
      event(1, TOOL_EXECUTION_START, {
        toolCallId: "call_parent",
        toolName: "spawnSubAgent",
        toolArgs: "{\"role\":\"Scout\"}",
      }),
      event(2, SUB_AGENT_EVENT, {
        parentToolCallId: "call_parent",
        event: { type: "text_delta", delta: "reading\n" },
      }),
      event(3, SUB_AGENT_EVENT, {
        parentToolCallId: "call_parent",
        event: {
          type: "tool_start",
          toolCallId: "call_child",
          toolName: "view",
          toolArgs: "{\"filePath\":\"package.json\"}",
        },
      }),
      event(4, SUB_AGENT_EVENT, {
        parentToolCallId: "call_parent",
        event: {
          type: "tool_end",
          toolCallId: "call_child",
          toolName: "view",
          toolArgs: "{\"filePath\":\"package.json\"}",
          result: "1: {\"name\":\"excelsior\"}",
          isError: false,
        },
      }),
      event(5, SUB_AGENT_EVENT, {
        parentToolCallId: "call_parent",
        event: { type: "final", content: "done" },
      }),
      event(6, TOOL_EXECUTION_END, {
        toolCallId: "call_parent",
        toolName: "spawnSubAgent",
        toolArgs: "{\"role\":\"Scout\"}",
        result: "done",
        isError: false,
      }),
    ];

    const blocks = projectEventsToDisplayBlocks(events);
    expect(blocks).toMatchObject([
      {
        type: "sub-agent",
        role: "Scout",
        state: {
          status: "done",
          latestLine: "done",
          fullOutput: "done",
          toolCalls: [{
            toolName: "view",
            status: "completed",
            content: "1: {\"name\":\"excelsior\"}",
          }],
          parts: [
            { type: "text", text: "reading\n" },
            {
              type: "tool-call",
              toolName: "view",
              status: "completed",
              content: "1: {\"name\":\"excelsior\"}",
            },
          ],
        },
      },
    ]);
  });

  it("keeps parallel spawned sub-agent progress scoped by parent tool call", () => {
    const events = [
      event(1, TOOL_EXECUTION_START, {
        toolCallId: "parent_a",
        toolName: "spawnSubAgent",
        toolArgs: "{\"role\":\"A\"}",
      }),
      event(2, TOOL_EXECUTION_START, {
        toolCallId: "parent_b",
        toolName: "spawnSubAgent",
        toolArgs: "{\"role\":\"B\"}",
      }),
      event(3, SUB_AGENT_EVENT, {
        parentToolCallId: "parent_a",
        event: { type: "text_delta", delta: "a" },
      }),
      event(4, SUB_AGENT_EVENT, {
        parentToolCallId: "parent_b",
        event: { type: "text_delta", delta: "b" },
      }),
    ];

    expect(projectEventsToDisplayBlocks(events)).toMatchObject([
      { type: "sub-agent", role: "A", state: { fullOutput: "a" } },
      { type: "sub-agent", role: "B", state: { fullOutput: "b" } },
    ]);
  });

  it("scopes tool display block ids when provider tool call ids repeat across turns", () => {
    const events = [
      event(1, TOOL_EXECUTION_START, {
        toolCallId: "call_reused",
        toolName: "view",
        toolArgs: "{\"filePath\":\"a.ts\"}",
      }, { runId: "run_a", turnId: "turn_a" }),
      event(2, TOOL_EXECUTION_END, {
        toolCallId: "call_reused",
        toolName: "view",
        toolArgs: "{\"filePath\":\"a.ts\"}",
        result: "a",
        isError: false,
      }, { runId: "run_a", turnId: "turn_a" }),
      event(3, TOOL_EXECUTION_START, {
        toolCallId: "call_reused",
        toolName: "view",
        toolArgs: "{\"filePath\":\"b.ts\"}",
      }, { runId: "run_b", turnId: "turn_b" }),
      event(4, TOOL_EXECUTION_END, {
        toolCallId: "call_reused",
        toolName: "view",
        toolArgs: "{\"filePath\":\"b.ts\"}",
        result: "b",
        isError: false,
      }, { runId: "run_b", turnId: "turn_b" }),
    ];

    const ids = projectEventsToDisplayBlocks(events).map((block) => block.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("updates an overlapping tool block instead of duplicating its id", () => {
    const events = [
      event(1, TOOL_EXECUTION_START, {
        toolCallId: "call_a",
        toolName: "view",
        toolArgs: "{\"filePath\":\"a.ts\"}",
      }),
      event(2, TOOL_EXECUTION_START, {
        toolCallId: "call_b",
        toolName: "view",
        toolArgs: "{\"filePath\":\"b.ts\"}",
      }),
      event(3, TOOL_EXECUTION_END, {
        toolCallId: "call_a",
        toolName: "view",
        toolArgs: "{\"filePath\":\"a.ts\"}",
        result: "a",
        isError: false,
      }),
      event(4, TOOL_EXECUTION_END, {
        toolCallId: "call_b",
        toolName: "view",
        toolArgs: "{\"filePath\":\"b.ts\"}",
        result: "b",
        isError: false,
      }),
    ];

    const blocks = projectEventsToDisplayBlocks(events);
    const ids = blocks.map((block) => block.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(blocks).toMatchObject([
      { type: "tool-call", toolName: "view", content: "a", status: "completed" },
      { type: "tool-call", toolName: "view", content: "b", status: "completed" },
    ]);
  });

  it("replaces a pending tool block when a failed partial tool input is finalized", () => {
    const events = [
      event(1, TOOL_EXECUTION_START, {
        toolCallId: "call_write",
        toolName: "write",
        toolArgs: "{\"filePath\":\"report.html\",\"content\":\"<html>",
      }),
      event(2, ERROR, {
        message: "Unterminated string in JSON at position 554",
      }),
      event(3, TOOL_EXECUTION_END, {
        toolCallId: "call_write",
        toolName: "write",
        toolArgs: "{\"filePath\":\"report.html\",\"content\":\"<html>",
        result: "Tool input failed before execution. Unterminated string in JSON at position 554",
        isError: true,
      }),
    ];

    const blocks = projectEventsToDisplayBlocks(events);
    const toolBlocks = blocks.filter((block) => block.type === "tool-call");

    expect(toolBlocks).toHaveLength(1);
    expect(toolBlocks[0]).toMatchObject({
      type: "tool-call",
      toolName: "write",
      status: "error",
    });
    expect(toolBlocks.some((block) => block.status === "pending")).toBe(false);
  });

  it("keeps assistant display block ids unique when stream text ids repeat", () => {
    const events = [
      event(1, MESSAGE_START, {
        message: { id: "msg_step_txt-0", role: "assistant", content: "" },
      }),
      event(2, MESSAGE_UPDATE, {
        messageId: "msg_step_txt-0",
        role: "assistant",
        delta: "first",
      }),
      event(3, MESSAGE_END, {
        message: { id: "msg_step_txt-0", role: "assistant", content: "first" },
      }),
      event(4, MESSAGE_START, {
        message: { id: "msg_step_txt-0", role: "assistant", content: "" },
      }),
      event(5, MESSAGE_UPDATE, {
        messageId: "msg_step_txt-0",
        role: "assistant",
        delta: "second",
      }),
      event(6, MESSAGE_END, {
        message: { id: "msg_step_txt-0", role: "assistant", content: "second" },
      }),
    ];

    const blocks = projectEventsToDisplayBlocks(events);
    const ids = blocks.map((block) => block.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(blocks).toMatchObject([
      { type: "assistant", content: "first" },
      { type: "assistant", content: "second" },
    ]);
  });

  it("projects reasoning blocks from reasoning events", () => {
    const events = [
      event(1, REASONING_END, {
        messageId: "reasoning_0",
        content: "I should check the folder structure first.",
      }),
      event(2, MESSAGE_END, {
        message: { id: "msg_assistant", role: "assistant", content: "Hello!" },
      }),
    ];

    const blocks = projectEventsToDisplayBlocks(events);
    expect(blocks).toMatchObject([
      { type: "reasoning", content: "I should check the folder structure first.", isFrozen: true },
      { type: "assistant", content: "Hello!", isFrozen: true },
    ]);
  });

  it("incrementally projects appended events without duplicating active drafts", () => {
    const cache = new ProjectionCache();
    const events = [
      event(1, MESSAGE_START, {
        message: { id: "msg_stream", role: "assistant", content: "" },
      }),
      event(2, MESSAGE_UPDATE, {
        messageId: "msg_stream",
        role: "assistant",
        delta: "hel",
      }),
    ];

    expect(cache.project(events).displayBlocks).toMatchObject([
      { type: "assistant", id: "msg_stream", content: "hel" },
    ]);
    expect(cache.project(events).displayBlocks).toMatchObject([
      { type: "assistant", id: "msg_stream", content: "hel" },
    ]);

    events.push(event(3, MESSAGE_UPDATE, {
      messageId: "msg_stream",
      role: "assistant",
      delta: "lo",
    }));

    const blocks = cache.project(events).displayBlocks;
    expect(blocks).toHaveLength(1);
    expect(blocks).toMatchObject([
      { type: "assistant", id: "msg_stream", content: "hello" },
    ]);
  });

  it("only applies newly appended events after the first cached projection", () => {
    const cache = new ProjectionCache();
    const applyEvent = vi.spyOn(AssistantStateMachine.prototype, "applyEvent");
    const events = [
      event(1, MESSAGE_START, {
        message: { id: "msg_stream", role: "assistant", content: "" },
      }),
      event(2, MESSAGE_UPDATE, {
        messageId: "msg_stream",
        role: "assistant",
        delta: "hel",
      }),
    ];

    cache.project(events);
    expect(applyEvent).toHaveBeenCalledTimes(2);

    events.push(event(3, MESSAGE_UPDATE, {
      messageId: "msg_stream",
      role: "assistant",
      delta: "lo",
    }));

    cache.project(events);
    expect(applyEvent).toHaveBeenCalledTimes(3);
  });
});
