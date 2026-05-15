import { describe, expect, it } from "vitest";
import {
  createChatTranscriptProjectionState,
  projectEventsToDisplayBlocks,
  reduceChatTranscriptEvent,
} from "@excelsior/agent-host/testing/projection";
import { PERSISTENCE_ERROR, type AnyAgentEvent } from "@excelsior/agent-host/testing/runtime";
import { makeEvent } from "./projection/helpers.js";

describe("chat transcript projection", () => {
  describe("reduceChatTranscriptEvent", () => {
    it("produces a user block from user-input event", () => {
      let state = createChatTranscriptProjectionState();
      state = reduceChatTranscriptEvent(state, makeEvent({
        type: "user-input",
        data: { content: "hello" },
      }));
      expect(state.blocks).toHaveLength(1);
      expect(state.blocks[0]).toMatchObject({ type: "user", content: "hello", isFrozen: true });
    });

    it("accumulates text-delta into an assistant block", () => {
      let state = createChatTranscriptProjectionState();
      state = reduceChatTranscriptEvent(state, makeEvent({
        type: "text-delta",
        data: { delta: "Hello " },
      }));
      state = reduceChatTranscriptEvent(state, makeEvent({
        type: "text-delta",
        data: { delta: "world" },
      }));
      expect(state.pendingAssistant?.fullText).toBe("Hello world");
    });

    it("flushes assistant block on user-input", () => {
      let state = createChatTranscriptProjectionState();
      state = reduceChatTranscriptEvent(state, makeEvent({ type: "text-delta", data: { delta: "Hello " } }));
      state = reduceChatTranscriptEvent(state, makeEvent({
        type: "user-input",
        data: { content: "next" },
      }));
      expect(state.blocks).toHaveLength(2);
      expect(state.blocks[0]).toMatchObject({ type: "assistant", content: "Hello ", isFrozen: true });
      expect(state.blocks[1]).toMatchObject({ type: "user", content: "next" });
    });

    it("flushes assistant and creates tool-call block on tool-call-start", () => {
      let state = createChatTranscriptProjectionState();
      state = reduceChatTranscriptEvent(state, makeEvent({ type: "text-delta", data: { delta: "Thinking" } }));
      state = reduceChatTranscriptEvent(state, makeEvent({
        type: "tool-call-start",
        data: { toolName: "readFile", toolArgs: '{"path":"x.txt"}', toolCallId: "tc1" },
      }));
      expect(state.blocks).toHaveLength(1);
      expect(state.pendingTool).toMatchObject({ toolName: "readFile", status: "pending" });
    });

    it("flushes pending tool on error", () => {
      let state = createChatTranscriptProjectionState();
      state = reduceChatTranscriptEvent(state, makeEvent({
        type: "tool-call-start",
        data: { toolName: "readFile", toolArgs: "{}", toolCallId: "tc1" },
      }));
      state = reduceChatTranscriptEvent(state, makeEvent({
        type: "error",
        data: { message: "Something broke" },
      }));
      expect(state.blocks).toHaveLength(2);
      expect(state.blocks[0]).toMatchObject({ type: "tool-call", toolName: "readFile" });
      expect(state.blocks[1]).toMatchObject({ type: "assistant", content: "Error: Something broke" });
    });

    it("tracks child-run-attached for sub-agent blocks", () => {
      let state = createChatTranscriptProjectionState();
      state = reduceChatTranscriptEvent(state, makeEvent({
        type: "child-run-attached",
        data: { childRunId: "child1", parentToolCallId: "tc1", role: "Bug Hunter" },
      }));
      expect(state.childRunIdByToolCallId.get("tc1")).toEqual({ childRunId: "child1", role: "Bug Hunter" });
    });
  });

  describe("projectEventsToDisplayBlocks", () => {
    it("returns empty array for no events", () => {
      expect(projectEventsToDisplayBlocks([])).toEqual([]);
    });

    it("does not freeze pending assistant message during streaming", () => {
      const events: AnyAgentEvent[] = [
        makeEvent({ type: "run-start", data: {} }),
        makeEvent({ type: "text-delta", data: { delta: "Thinking..." } }),
      ];
      const blocks = projectEventsToDisplayBlocks(events);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "assistant",
        content: "Thinking...",
      });
      expect((blocks[0] as any).isFrozen).toBeFalsy();
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
      const blocks = projectEventsToDisplayBlocks(events);
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({ type: "user", content: "List files" });
      expect(blocks[1]).toMatchObject({ type: "assistant", content: "Sure, let me check." });
      expect(blocks[2]).toMatchObject({ type: "tool-call", toolName: "ls", status: "completed" });
    });

    it("flushes a pending regular tool as an unfrozen pending block", () => {
      const blocks = projectEventsToDisplayBlocks([
        makeEvent({
          type: "tool-call-start",
          data: { toolName: "view", toolArgs: '{"filePath":"README.md"}', toolCallId: "tc_view" },
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
      expect((blocks[0] as any).isFrozen).toBeFalsy();
    });

    it("flushes a pending sub-agent tool as a running sub-agent block", () => {
      const blocks = projectEventsToDisplayBlocks([
        makeEvent({
          type: "child-run-attached",
          data: { childRunId: "child1", parentToolCallId: "tc_agent", role: "Bug Hunter" },
        }),
        makeEvent({
          type: "tool-call-start",
          data: { toolName: "spawnSubAgent", toolArgs: JSON.stringify({ role: "Bug Hunter" }), toolCallId: "tc_agent" },
        }),
      ]);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "sub-agent",
        id: "tc_agent",
        role: "Bug Hunter",
        state: { status: "running" },
      });
      expect((blocks[0] as any).isFrozen).toBeFalsy();
    });

    it("updates a flushed regular tool when its result arrives late", () => {
      const blocks = projectEventsToDisplayBlocks([
        makeEvent({
          type: "tool-call-start",
          data: { toolName: "view", toolArgs: '{"filePath":"README.md"}', toolCallId: "tc_view" },
        }),
        makeEvent({
          type: "tool-call-start",
          data: { toolName: "ripgrep", toolArgs: '{"query":"foo"}', toolCallId: "tc_grep" },
        }),
        makeEvent({
          type: "tool-call-end",
          relatedToolCallId: "tc_view",
          data: { toolCallId: "tc_view", result: "file contents", status: "success", toolName: "view", toolArgs: "{}" },
        }),
        makeEvent({
          type: "tool-call-end",
          relatedToolCallId: "tc_grep",
          data: { toolCallId: "tc_grep", result: "matches", status: "success", toolName: "ripgrep", toolArgs: "{}" },
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
      const blocks = projectEventsToDisplayBlocks([
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

    it("flushes pending assistant and tool before a persistence warning", () => {
      const blocks = projectEventsToDisplayBlocks([
        makeEvent({ type: "text-delta", data: { delta: "Thinking" } }),
        makeEvent({
          type: "tool-call-start",
          data: { toolName: "view", toolArgs: '{"filePath":"README.md"}', toolCallId: "tc_view" },
        }),
        makeEvent({
          type: PERSISTENCE_ERROR,
          data: {
            message: "Failed to persist run event: disk full",
            failedEventType: "tool-call-start",
          },
        }),
      ]);

      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({
        type: "assistant",
        content: "Thinking",
        isFrozen: true,
      });
      expect(blocks[1]).toMatchObject({
        type: "tool-call",
        id: "tc_view",
        status: "pending",
      });
      expect(blocks[2]).toMatchObject({
        type: "assistant",
        content: "Persistence warning (tool-call-start): Failed to persist run event: disk full",
        isFrozen: true,
      });
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
      let requestedChildRunId: string | undefined;
      const blocks = projectEventsToDisplayBlocks(events, {
        getChildEvents: (childRunId) => {
          requestedChildRunId = childRunId;
          return [
            makeEvent({ type: "text-delta", data: { delta: "Found a bug" } }),
          ];
        },
      });
      expect(blocks).toHaveLength(1);
      expect(requestedChildRunId).toBe("child1");
      expect(blocks[0]).toMatchObject({ type: "sub-agent", role: "Bug Hunter" });
      const subBlock = blocks[0] as any;
      expect(subBlock.state.status).toBe("done");
    });

    it("marks a flushed sub-agent done when its result arrives after another tool starts", () => {
      const events: AnyAgentEvent[] = [
        makeEvent({
          type: "child-run-attached",
          data: { childRunId: "child1", parentToolCallId: "tc1", role: "Code Style Reviewer" },
        }),
        makeEvent({
          type: "tool-call-start",
          data: { toolName: "spawnSubAgent", toolArgs: JSON.stringify({ role: "Code Style Reviewer" }), toolCallId: "tc1" },
        }),
        makeEvent({
          type: "tool-call-start",
          data: { toolName: "view", toolArgs: JSON.stringify({ filePath: "src/index.ts" }), toolCallId: "tc2" },
        }),
        makeEvent({
          type: "tool-call-end",
          relatedToolCallId: "tc1",
          data: { toolCallId: "tc1", result: "Review complete", status: "success", toolName: "unknown", toolArgs: "{}" },
        }),
        makeEvent({
          type: "tool-call-end",
          relatedToolCallId: "tc2",
          data: { toolCallId: "tc2", result: "file contents", status: "success", toolName: "view", toolArgs: "{}" },
        }),
      ];

      const blocks = projectEventsToDisplayBlocks(events);
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: "sub-agent",
        role: "Code Style Reviewer",
        isFrozen: true,
        state: { status: "done", fullOutput: "Review complete" },
      });
      expect(blocks[1]).toMatchObject({ type: "tool-call", toolName: "view", status: "completed" });
      expect(blocks.some((block) => block.type === "tool-call" && block.toolName === "unknown")).toBe(false);
    });
  });
});
