import { describe, expect, it } from "vitest";
import {
  completedReplayEvents,
  dropLastCompletedTurnFromEvents,
  findLastCompletedTurn,
  TURN_COMPLETE,
  type AnyAgentEvent,
} from "@excelsior/agent-storage";

function event(
  runId: string,
  type: string,
  sequence: number,
  data: unknown = {},
  overrides: Partial<Pick<AnyAgentEvent, "correlationId" | "parentEventId" | "timestamp">> = {},
): AnyAgentEvent {
  return {
    id: `evt_${runId}_${sequence}_${type}`,
    runId,
    sequence,
    type,
    version: 1,
    causationId: "",
    correlationId: overrides.correlationId ?? runId,
    timestamp: overrides.timestamp ?? `2026-01-01T00:00:0${sequence}.000Z`,
    data,
    parentEventId: overrides.parentEventId,
  };
}

function checkpoint(runId: string, sequence: number): AnyAgentEvent {
  return event(runId, TURN_COMPLETE, sequence, { runId });
}

describe("run replay policy", () => {
  it("loads legacy uncheckpointed events in replay order", () => {
    const events = [
      event("run_1", "text-delta", 2),
      event("run_1", "user-input", 0),
      event("run_1", "text-delta", 1),
    ];

    expect(completedReplayEvents(events).map((entry) => entry.sequence)).toEqual([0, 1, 2]);
  });

  it("filters replay to completed runs and their correlated child events", () => {
    const completed = [
      event("run_1", "user-input", 0),
      event("child_1", "text-delta", 0, {}, { correlationId: "run_1" }),
      checkpoint("run_1", 1),
      event("run_2", "user-input", 0),
    ];

    expect(completedReplayEvents(completed).map((entry) => entry.runId)).toEqual([
      "run_1",
      "child_1",
      "run_1",
    ]);
  });

  it("finds and drops the latest completed turn as a pure policy operation", () => {
    const events = [
      event("run_1", "user-input", 0),
      checkpoint("run_1", 1),
      event("run_2", "user-input", 0),
      event("child_2", "text-delta", 0, {}, { parentEventId: "run_2" }),
      checkpoint("run_2", 1),
    ];

    expect(findLastCompletedTurn(events)).toMatchObject({
      runId: "run_2",
      eventCount: 3,
    });

    const result = dropLastCompletedTurnFromEvents(events, "run_2");

    expect(result).toMatchObject({
      dropped: true,
      runId: "run_2",
      removedEvents: 3,
    });
    expect(result.remainingEvents.map((entry) => entry.runId)).toEqual(["run_1", "run_1"]);
  });
});
