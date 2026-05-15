import { describe, expect, it } from "vitest";
import {
  buildAIHistory,
  computeDisplayBlocks,
  mergeEvents,
} from "@excelsior/agent-host/testing/projection";
import type { AnyAgentEvent } from "@excelsior/agent-host/testing/runtime";
import { makeChildRun, makeEvent } from "./projection/helpers.js";

describe("projection merger", () => {
  it("lets live events win over persisted duplicates", () => {
    const persisted = makeEvent({
      id: "evt_same",
      type: "text-delta",
      data: { delta: "persisted" },
    });
    const live = makeEvent({
      id: "evt_same",
      type: "text-delta",
      data: { delta: "live" },
    });

    const events = mergeEvents({
      liveEvents: [live],
      persistedEvents: [persisted],
      childRuns: new Map(),
    });

    expect(events).toEqual([live]);
  });

  it("does not include child run events in restored parent AI history", () => {
    const history = buildAIHistory({
      liveEvents: [],
      persistedEvents: [
        makeEvent({
          type: "user-input",
          runId: "run_parent",
          data: { content: "review" },
        }),
        makeEvent({
          type: "text-delta",
          runId: "run_child",
          parentEventId: "run_parent",
          correlationId: "run_parent",
          data: { delta: "child-only detail" },
        }),
      ],
      childRuns: new Map(),
    });

    expect(history).toEqual([{ role: "user", content: "review" }]);
  });

  it("rebuilds restored sub-agent rows from persisted child events", () => {
    const parentRunId = "run_parent";
    const childRunId = "run_child";
    const events: AnyAgentEvent[] = [
      makeEvent({
        type: "child-run-attached",
        runId: parentRunId,
        sequence: 1,
        data: { childRunId, parentToolCallId: "tc1", role: "Bug Hunter" },
      }),
      makeEvent({
        type: "tool-call-start",
        runId: parentRunId,
        sequence: 2,
        data: { toolName: "spawnSubAgent", toolArgs: JSON.stringify({ role: "Bug Hunter" }), toolCallId: "tc1" },
      }),
      makeEvent({
        type: "tool-call-end",
        runId: parentRunId,
        sequence: 3,
        relatedToolCallId: "tc1",
        data: { toolCallId: "tc1", result: "Done", status: "success", toolName: "spawnSubAgent", toolArgs: "{}" },
      }),
      makeEvent({
        type: "text-delta",
        runId: childRunId,
        parentEventId: parentRunId,
        correlationId: parentRunId,
        sequence: 0,
        data: { delta: "child output" },
      }),
      makeEvent({
        type: "tool-call-start",
        runId: childRunId,
        parentEventId: parentRunId,
        correlationId: parentRunId,
        sequence: 1,
        relatedToolCallId: "child_tc",
        data: { toolName: "view", toolArgs: JSON.stringify({ filePath: "README.md" }), toolCallId: "child_tc" },
      }),
      makeEvent({
        type: "tool-call-end",
        runId: childRunId,
        parentEventId: parentRunId,
        correlationId: parentRunId,
        sequence: 2,
        relatedToolCallId: "child_tc",
        data: { toolCallId: "child_tc", result: "ok", status: "success", toolName: "view", toolArgs: "{}" },
      }),
    ];

    const blocks = computeDisplayBlocks({
      liveEvents: [],
      persistedEvents: events,
      childRuns: new Map(),
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "sub-agent", role: "Bug Hunter" });
    const subAgent = blocks[0] as any;
    expect(subAgent.state.fullOutput).toBe("child output");
    expect(subAgent.state.toolCalls).toHaveLength(1);
    expect(subAgent.state.toolCalls[0]).toMatchObject({ toolName: "view", status: "completed" });
  });

  it("prefers a live child run snapshot over persisted child events", () => {
    const parentRunId = "run_parent";
    const childRunId = "run_child";
    const parentEvents: AnyAgentEvent[] = [
      makeEvent({
        type: "child-run-attached",
        runId: parentRunId,
        data: { childRunId, parentToolCallId: "tc1", role: "Bug Hunter" },
      }),
      makeEvent({
        type: "tool-call-start",
        runId: parentRunId,
        data: { toolName: "spawnSubAgent", toolArgs: JSON.stringify({ role: "Bug Hunter" }), toolCallId: "tc1" },
      }),
      makeEvent({
        type: "tool-call-end",
        runId: parentRunId,
        relatedToolCallId: "tc1",
        data: { toolCallId: "tc1", result: "Done", status: "success", toolName: "spawnSubAgent", toolArgs: "{}" },
      }),
    ];
    const persistedChild = makeEvent({
      type: "text-delta",
      runId: childRunId,
      parentEventId: parentRunId,
      data: { delta: "persisted child" },
    });
    const liveChild = makeEvent({
      type: "text-delta",
      runId: childRunId,
      parentEventId: parentRunId,
      data: { delta: "live child" },
    });

    const blocks = computeDisplayBlocks({
      liveEvents: [],
      persistedEvents: [...parentEvents, persistedChild],
      childRuns: new Map([[childRunId, makeChildRun([liveChild])]]),
    });

    expect((blocks[0] as any).state.fullOutput).toBe("live child");
  });
});
