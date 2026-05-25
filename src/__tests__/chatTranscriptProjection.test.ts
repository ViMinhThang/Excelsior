import { describe, expect, it } from "vitest";
import { ProjectionService } from "@excelsior/agent-host/testing/application";
import {
  PERSISTENCE_ERROR,
  type AnyAgentEvent,
} from "@excelsior/agent-host/testing/runtime";
import { makeEvent } from "./projection/helpers.js";

function projectDisplay(events: readonly AnyAgentEvent[]) {
  return new ProjectionService().project({
    liveEvents: [],
    persistedEvents: [...events],
    childRuns: new Map(),
  }).displayBlocks;
}

describe("chat transcript projection", () => {
  it("returns empty display blocks for no events", () => {
    expect(projectDisplay([])).toEqual([]);
  });

  it("does not freeze pending assistant message during streaming", () => {
    const blocks = projectDisplay([
      makeEvent({ type: "run-start", data: {} }),
      makeEvent({ type: "text-delta", data: { delta: "Thinking..." } }),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "assistant",
      content: "Thinking...",
    });
    expect(blocks[0].isFrozen).toBeFalsy();
  });

  it("projects user, assistant, and tool blocks", () => {
    const blocks = projectDisplay([
      makeEvent({ type: "user-input", data: { content: "List files" } }),
      makeEvent({ type: "text-delta", data: { delta: "Sure, " } }),
      makeEvent({ type: "text-delta", data: { delta: "let me check." } }),
      makeEvent({
        type: "tool-call-start",
        data: { toolName: "ls", toolArgs: '{"path":"."}', toolCallId: "tc1" },
      }),
      makeEvent({
        type: "tool-call-end",
        relatedToolCallId: "tc1",
        data: {
          toolCallId: "tc1",
          result: "file1\nfile2",
          status: "success",
          toolName: "ls",
          toolArgs: '{"path":"."}',
        },
      }),
    ]);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ type: "user", content: "List files" });
    expect(blocks[1]).toMatchObject({
      type: "assistant",
      content: "Sure, let me check.",
    });
    expect(blocks[2]).toMatchObject({
      type: "tool-call",
      toolName: "ls",
      status: "completed",
    });
  });

  it("flushes a pending regular tool as an unfrozen pending block", () => {
    const blocks = projectDisplay([
      makeEvent({
        type: "tool-call-start",
        data: {
          toolName: "view",
          toolArgs: '{"filePath":"README.md"}',
          toolCallId: "tc_view",
        },
      }),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "tool-call",
      id: "tc_view",
      toolName: "view",
      status: "pending",
      content: "",
    });
    expect(blocks[0].isFrozen).toBeFalsy();
  });

  it("flushes a pending sub-agent tool as a running sub-agent block", () => {
    const blocks = projectDisplay([
      makeEvent({
        type: "child-run-attached",
        data: {
          childRunId: "child1",
          parentToolCallId: "tc_agent",
          role: "Bug Hunter",
        },
      }),
      makeEvent({
        type: "tool-call-start",
        data: {
          toolName: "spawnSubAgent",
          toolArgs: JSON.stringify({ role: "Bug Hunter" }),
          toolCallId: "tc_agent",
        },
      }),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "sub-agent",
      id: "tc_agent",
      role: "Bug Hunter",
      state: { status: "running" },
    });
    expect(blocks[0].isFrozen).toBeFalsy();
  });

  it("updates a flushed regular tool when its result arrives late", () => {
    const blocks = projectDisplay([
      makeEvent({
        type: "tool-call-start",
        data: {
          toolName: "view",
          toolArgs: '{"filePath":"README.md"}',
          toolCallId: "tc_view",
        },
      }),
      makeEvent({
        type: "tool-call-start",
        data: { toolName: "ripgrep", toolArgs: '{"query":"foo"}', toolCallId: "tc_grep" },
      }),
      makeEvent({
        type: "tool-call-end",
        relatedToolCallId: "tc_view",
        data: {
          toolCallId: "tc_view",
          result: "file contents",
          status: "success",
          toolName: "view",
          toolArgs: "{}",
        },
      }),
      makeEvent({
        type: "tool-call-end",
        relatedToolCallId: "tc_grep",
        data: {
          toolCallId: "tc_grep",
          result: "matches",
          status: "success",
          toolName: "ripgrep",
          toolArgs: "{}",
        },
      }),
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "tool-call",
      id: "tc_view",
      status: "completed",
      content: "file contents",
      isFrozen: true,
    });
    expect(blocks[1]).toMatchObject({
      type: "tool-call",
      id: "tc_grep",
      status: "completed",
      content: "matches",
      isFrozen: true,
    });
  });

  it("renders persistence errors as warning messages", () => {
    const blocks = projectDisplay([
      makeEvent({
        type: PERSISTENCE_ERROR,
        data: {
          message: "Failed to persist run event: disk full",
          failedEventType: "text-delta",
        },
      }),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "assistant",
      content: "Persistence warning (text-delta): Failed to persist run event: disk full",
    });
  });
});
