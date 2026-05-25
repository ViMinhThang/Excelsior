import { describe, expect, it } from "vitest";
import { ProjectionPolicy } from "@excelsior/agent-host/testing/application";
import type { AnyAgentEvent } from "@excelsior/agent-host/testing/runtime";
import { makeChildRun, makeEvent } from "./projection/helpers.js";

function projectSubAgent(
  childEvents: readonly AnyAgentEvent[],
  status: "running" | "done" | "error" = "running",
) {
  const parentEvents: AnyAgentEvent[] = [
    makeEvent({
      type: "child-run-attached",
      data: {
        childRunId: "run_child",
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
  ];

  if (status !== "running") {
    parentEvents.push(
      makeEvent({
        type: "tool-call-end",
        relatedToolCallId: "tc_agent",
        data: {
          toolCallId: "tc_agent",
          result: "",
          status: status === "error" ? "error" : "success",
          toolName: "spawnSubAgent",
          toolArgs: "{}",
        },
      }),
    );
  }

  const blocks = new ProjectionPolicy().project({
    liveEvents: [],
    persistedEvents: parentEvents,
    childRuns: new Map([["run_child", makeChildRun(childEvents)]]),
  }).displayBlocks;

  const block = blocks[0];
  if (block?.type !== "sub-agent") throw new Error("Expected sub-agent block");
  return block.state;
}

describe("sub-agent projection through ProjectionService", () => {
  it("produces empty running state for no child events", () => {
    const state = projectSubAgent([]);

    expect(state.status).toBe("running");
    expect(state.fullOutput).toBe("");
    expect(state.parts).toEqual([]);
  });

  it("merges adjacent text deltas into a single text part", () => {
    const state = projectSubAgent([
      makeEvent({ type: "text-delta", data: { delta: "Step 1" } }),
      makeEvent({ type: "text-delta", data: { delta: " done" } }),
    ]);

    expect(state.fullOutput).toBe("Step 1 done");
    expect(state.parts).toEqual([{ type: "text", text: "Step 1 done" }]);
  });

  it("tracks pending, completed, and error tool call statuses", () => {
    const state = projectSubAgent([
      makeEvent({
        type: "tool-call-start",
        data: {
          toolName: "view",
          toolArgs: '{"path":"README.md"}',
          toolCallId: "tc_view",
        },
        relatedToolCallId: "tc_view",
      }),
      makeEvent({
        type: "tool-call-start",
        data: {
          toolName: "ripgrep",
          toolArgs: '{"query":"foo"}',
          toolCallId: "tc_grep",
        },
        relatedToolCallId: "tc_grep",
      }),
      makeEvent({
        type: "tool-call-start",
        data: {
          toolName: "runCommand",
          toolArgs: '{"command":"npm"}',
          toolCallId: "tc_shell",
        },
        relatedToolCallId: "tc_shell",
      }),
      makeEvent({
        type: "tool-call-end",
        relatedToolCallId: "tc_view",
        data: {
          toolCallId: "tc_view",
          result: "ok",
          status: "success",
          toolName: "view",
          toolArgs: "{}",
        },
      }),
      makeEvent({
        type: "tool-call-end",
        relatedToolCallId: "tc_shell",
        data: {
          toolCallId: "tc_shell",
          result: "failed",
          status: "error",
          toolName: "runCommand",
          toolArgs: "{}",
        },
      }),
    ]);

    expect(state.toolCalls.map((toolCall) => toolCall.status)).toEqual([
      "completed",
      "pending",
      "error",
    ]);
    expect(
      state.parts.map((part) =>
        part.type === "tool-call" ? part.status : part.type,
      ),
    ).toEqual(["completed", "pending", "error"]);
  });

  it("preserves text and tool-call ordering", () => {
    const state = projectSubAgent([
      makeEvent({ type: "text-delta", data: { delta: "Step 1" } }),
      makeEvent({
        type: "tool-call-start",
        data: {
          toolName: "view",
          toolArgs: '{"path":"README.md"}',
          toolCallId: "tc_readme",
        },
        relatedToolCallId: "tc_readme",
      }),
      makeEvent({
        type: "tool-call-end",
        data: {
          toolCallId: "tc_readme",
          result: "ok",
          status: "success",
          toolName: "view",
          toolArgs: "{}",
        },
        relatedToolCallId: "tc_readme",
      }),
      makeEvent({ type: "text-delta", data: { delta: "\nStep 2" } }),
    ], "done");

    expect(state.status).toBe("done");
    expect(state.parts.map((part) => part.type)).toEqual([
      "text",
      "tool-call",
      "text",
    ]);
    expect(state.fullOutput).toBe("Step 1\nStep 2");
    expect(state.latestLine).toBe("Step 2");
    expect(state.toolCalls[0]).toMatchObject({
      toolName: "view",
      status: "completed",
    });
  });
});
