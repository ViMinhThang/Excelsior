import { describe, expect, it } from "vitest";
import { projectEvents as projectReadModelEvents } from "@excelsior/projection";
import {
  finalizeSubAgentProjection,
  projectSubAgentEvents,
  SUB_AGENT_MODEL,
} from "@excelsior/agent-host/testing/projection";
import type { AnyAgentEvent } from "@excelsior/agent-host/testing/runtime";
import { makeEvent } from "./projection/helpers.js";

describe("sub-agent projection", () => {
  it("produces empty state for no child events", () => {
    const state = projectSubAgentEvents([], "running", "2025-01-01T00:00:00Z");
    expect(state.status).toBe("running");
    expect(state.fullOutput).toBe("");
    expect(state.parts).toEqual([]);
  });

  it("uses fallback timing when there are no child events", () => {
    const fallback = "2025-01-01T00:00:00.000Z";
    const state = projectSubAgentEvents([], "done", fallback);
    expect(state.startTime).toBe(Date.parse(fallback));
    expect(state.endTime).toBe(Date.parse(fallback));
  });

  it("merges adjacent text deltas into a single text part", () => {
    const events: AnyAgentEvent[] = [
      makeEvent({ type: "text-delta", data: { delta: "Step 1" } }),
      makeEvent({ type: "text-delta", data: { delta: " done" } }),
    ];
    const state = projectSubAgentEvents(events, "running");
    expect(state.fullOutput).toBe("Step 1 done");
    expect(state.parts).toEqual([{ type: "text", text: "Step 1 done" }]);
  });

  it("tracks pending, completed, and error tool call statuses", () => {
    const events: AnyAgentEvent[] = [
      makeEvent({
        type: "tool-call-start",
        data: { toolName: "view", toolArgs: '{"path":"README.md"}', toolCallId: "tc_view" },
        relatedToolCallId: "tc_view",
      }),
      makeEvent({
        type: "tool-call-start",
        data: { toolName: "ripgrep", toolArgs: '{"query":"foo"}', toolCallId: "tc_grep" },
        relatedToolCallId: "tc_grep",
      }),
      makeEvent({
        type: "tool-call-start",
        data: { toolName: "runCommand", toolArgs: '{"command":"npm"}', toolCallId: "tc_shell" },
        relatedToolCallId: "tc_shell",
      }),
      makeEvent({
        type: "tool-call-end",
        relatedToolCallId: "tc_view",
        data: { toolCallId: "tc_view", result: "ok", status: "success", toolName: "view", toolArgs: "{}" },
      }),
      makeEvent({
        type: "tool-call-end",
        relatedToolCallId: "tc_shell",
        data: { toolCallId: "tc_shell", result: "failed", status: "error", toolName: "runCommand", toolArgs: "{}" },
      }),
    ];

    const state = projectSubAgentEvents(events, "done");

    expect(state.toolCalls.map((toolCall) => toolCall.status)).toEqual([
      "completed",
      "pending",
      "error",
    ]);
    expect(state.parts.map((part) => part.type === "tool-call" ? part.status : part.type)).toEqual([
      "completed",
      "pending",
      "error",
    ]);
  });

  it("preserves text and tool-call ordering through SUB_AGENT_MODEL", () => {
    const events: AnyAgentEvent[] = [
      makeEvent({ type: "text-delta", data: { delta: "Step 1" } }),
      makeEvent({
        type: "tool-call-start",
        data: { toolName: "view", toolArgs: '{"path":"README.md"}', toolCallId: "tc_readme" },
        relatedToolCallId: "tc_readme",
      }),
      makeEvent({
        type: "tool-call-end",
        data: { toolCallId: "tc_readme", result: "ok", status: "success", toolName: "view", toolArgs: "{}" },
        relatedToolCallId: "tc_readme",
      }),
      makeEvent({ type: "text-delta", data: { delta: "\nStep 2" } }),
    ];

    const projected = projectReadModelEvents(SUB_AGENT_MODEL, events);
    const state = finalizeSubAgentProjection(projected, "done");

    expect(state.parts.map((part) => part.type)).toEqual(["text", "tool-call", "text"]);
    expect(state.fullOutput).toBe("Step 1\nStep 2");
    expect(state.latestLine).toBe("Step 2");
    expect(state.toolCalls[0]).toMatchObject({ toolName: "view", status: "completed" });
  });
});
