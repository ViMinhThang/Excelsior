import { describe, expect, it } from "vitest";
import {
  createProjectionState,
  reduceProjectionEvent,
  groupEventsForDisplay,
} from "../lib/projection/projectEvents.js";
import { projectChildEventsToSubAgentState } from "../lib/projection/projectChildren.js";
import { projectEventsToAIHistory } from "../lib/projection/projectHistory.js";
import type { AnyAgentEvent } from "../lib/runtime/events.js";

function makeEvent(overrides: Partial<AnyAgentEvent> & { type: AnyAgentEvent["type"] }): AnyAgentEvent {
  return {
    id: `evt_${Math.random()}`,
    runId: "run_test",
    sequence: 0,
    version: 1,
    causationId: "",
    correlationId: "run_test",
    timestamp: new Date().toISOString(),
    data: {} as any,
    ...overrides,
  } as unknown as AnyAgentEvent;
}

describe("projectEvents", () => {
  describe("reduceProjectionEvent", () => {
    it("produces a user block from user-input event", () => {
      let state = createProjectionState();
      state = reduceProjectionEvent(state, makeEvent({
        type: "user-input",
        data: { content: "hello" },
      }));
      expect(state.blocks).toHaveLength(1);
      expect(state.blocks[0]).toMatchObject({ type: "user", content: "hello", isFrozen: true });
    });

    it("accumulates text-delta into an assistant block", () => {
      let state = createProjectionState();
      state = reduceProjectionEvent(state, makeEvent({
        type: "text-delta",
        data: { delta: "Hello " },
      }));
      state = reduceProjectionEvent(state, makeEvent({
        type: "text-delta",
        data: { delta: "world" },
      }));
      expect(state.pendingAssistant?.fullText).toBe("Hello world");
    });

    it("flushes assistant block on user-input", () => {
      let state = createProjectionState();
      state = reduceProjectionEvent(state, makeEvent({ type: "text-delta", data: { delta: "Hello " } }));
      state = reduceProjectionEvent(state, makeEvent({
        type: "user-input",
        data: { content: "next" },
      }));
      expect(state.blocks).toHaveLength(2);
      expect(state.blocks[0]).toMatchObject({ type: "assistant", content: "Hello ", isFrozen: true });
      expect(state.blocks[1]).toMatchObject({ type: "user", content: "next" });
    });

    it("flushes assistant and creates tool-call block on tool-call-start", () => {
      let state = createProjectionState();
      state = reduceProjectionEvent(state, makeEvent({ type: "text-delta", data: { delta: "Thinking" } }));
      state = reduceProjectionEvent(state, makeEvent({
        type: "tool-call-start",
        data: { toolName: "readFile", toolArgs: '{"path":"x.txt"}', toolCallId: "tc1" },
      }));
      expect(state.blocks).toHaveLength(1);
      expect(state.pendingTool).toMatchObject({ toolName: "readFile", status: "pending" });
    });

    it("flushes pending tool on error", () => {
      let state = createProjectionState();
      state = reduceProjectionEvent(state, makeEvent({
        type: "tool-call-start",
        data: { toolName: "readFile", toolArgs: '{}', toolCallId: "tc1" },
      }));
      state = reduceProjectionEvent(state, makeEvent({
        type: "error",
        data: { message: "Something broke" },
      }));
      expect(state.blocks).toHaveLength(2);
      expect(state.blocks[0]).toMatchObject({ type: "tool-call", toolName: "readFile" });
      expect(state.blocks[1]).toMatchObject({ type: "assistant", content: "Error: Something broke" });
    });

    it("tracks child-run-attached for sub-agent blocks", () => {
      let state = createProjectionState();
      state = reduceProjectionEvent(state, makeEvent({
        type: "child-run-attached",
        data: { childRunId: "child1", parentToolCallId: "tc1", role: "Bug Hunter" },
      }));
      expect(state.childRunIdByToolCallId.get("tc1")).toEqual({ childRunId: "child1", role: "Bug Hunter" });
    });
  });

  describe("groupEventsForDisplay", () => {
    it("returns empty array for no events", () => {
      expect(groupEventsForDisplay([])).toEqual([]);
    });

    it("full round-trip: user + assistant + tool", () => {
      const events: AnyAgentEvent[] = [
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
          data: { toolCallId: "tc1", result: "file1\nfile2", status: "success", toolName: "ls", toolArgs: '{"path":"."}' },
        }),
      ];
      const blocks = groupEventsForDisplay(events);
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({ type: "user", content: "List files" });
      expect(blocks[1]).toMatchObject({ type: "assistant", content: "Sure, let me check." });
      expect(blocks[2]).toMatchObject({ type: "tool-call", toolName: "ls", status: "completed" });
    });

    it("marks sub-agent tool as spawnSubAgent", () => {
      const events: AnyAgentEvent[] = [
        makeEvent({
          type: "child-run-attached",
          data: { childRunId: "child1", parentToolCallId: "tc1", role: "Bug Hunter" },
        }),
        makeEvent({
          type: "tool-call-start",
          data: { toolName: "spawnSubAgent", toolArgs: JSON.stringify({ role: "Bug Hunter" }), toolCallId: "tc1" },
        }),
        makeEvent({
          type: "tool-call-end",
          relatedToolCallId: "tc1",
          data: { toolCallId: "tc1", result: "Found bugs", status: "success", toolName: "spawnSubAgent", toolArgs: "{}" },
        }),
      ];
      const blocks = groupEventsForDisplay(events, {
        getChildEvents: () => [
          makeEvent({ type: "text-delta", data: { delta: "Found a bug" } }),
        ],
      });
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({ type: "sub-agent", role: "Bug Hunter" });
      const subBlock = blocks[0] as any;
      expect(subBlock.state.status).toBe("done");
    });
  });

  describe("projectChildEventsToSubAgentState", () => {
    it("produces empty state for no child events", () => {
      const state = projectChildEventsToSubAgentState([], "running", "2025-01-01T00:00:00Z");
      expect(state.status).toBe("running");
      expect(state.fullOutput).toBe("");
      expect(state.parts).toEqual([]);
    });

    it("accumulates text deltas into parts and fullOutput", () => {
      const events: AnyAgentEvent[] = [
        makeEvent({ type: "text-delta", data: { delta: "Step 1" } }),
        makeEvent({ type: "text-delta", data: { delta: " done" } }),
      ];
      const state = projectChildEventsToSubAgentState(events, "running");
      expect(state.fullOutput).toBe("Step 1 done");
      expect(state.parts).toHaveLength(1);
      expect(state.parts[0]).toMatchObject({ type: "text", text: "Step 1 done" });
    });

    it("tracks tool calls in sub-agent state", () => {
      const events: AnyAgentEvent[] = [
        makeEvent({
          type: "tool-call-start",
          data: { toolName: "grep", toolArgs: '{pattern:"foo"}', toolCallId: "tc2" },
          relatedToolCallId: "tc2",
        }),
        makeEvent({
          type: "tool-call-end",
          relatedToolCallId: "tc2",
          data: { toolCallId: "tc2", result: "matched", status: "success", toolName: "grep", toolArgs: "{}" },
        }),
      ];
      const state = projectChildEventsToSubAgentState(events, "done");
      expect(state.toolCalls).toHaveLength(1);
      expect(state.toolCalls[0]).toMatchObject({ toolName: "grep", status: "completed" });
      expect(state.parts).toHaveLength(1);
      expect(state.parts[0]).toMatchObject({ type: "tool-call", toolName: "grep", status: "completed" });
    });
  });

  describe("projectEventsToAIHistory", () => {
    it("converts user and assistant events to messages", () => {
      const events: AnyAgentEvent[] = [
        makeEvent({ type: "user-input", data: { content: "hi" } }),
        makeEvent({ type: "text-delta", data: { delta: "Hello" } }),
        makeEvent({ type: "text-delta", data: { delta: " there" } }),
      ];
      const history = projectEventsToAIHistory(events);
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({ role: "user", content: "hi" });
      expect(history[1]).toMatchObject({ role: "assistant", content: "Hello there" });
    });

    it("includes tool results in history", () => {
      const events: AnyAgentEvent[] = [
        makeEvent({ type: "user-input", data: { content: "run test" } }),
        makeEvent({
          type: "tool-call-end",
          data: { toolCallId: "tc1", result: "passed", status: "success", toolName: "runCommand", toolArgs: '{}' },
        }),
      ];
      const history = projectEventsToAIHistory(events);
      expect(history).toHaveLength(2);
      expect(history[1].content).toContain("[Tool: runCommand");
      expect(history[1].content).toContain("[Completed]");
    });

    it("marks error tool results", () => {
      const events: AnyAgentEvent[] = [
        makeEvent({
          type: "tool-call-end",
          data: { toolCallId: "tc1", result: "[Error] failed", status: "error", toolName: "runCommand", toolArgs: '{}' },
        }),
      ];
      const history = projectEventsToAIHistory(events);
      expect(history[0].content).toContain("[Error]");
    });
  });
});
