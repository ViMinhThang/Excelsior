import { describe, expect, it } from "vitest";
import type { ProjectedBlock, ProjectedTurn } from "@excelsior/core";
import {
  buildOptimisticTranscript,
  shouldClearOptimisticMessage,
} from "../src/hooks/optimisticTranscript.js";

const timestamp = "2026-05-18T00:00:00.000Z";

function userBlock(content: string, id = "user_1"): ProjectedBlock {
  return {
    type: "user",
    id,
    content,
    timestamp,
  };
}

describe("optimistic transcript", () => {
  it("appends a frozen optimistic user block when the submitted message is missing", () => {
    const blocks: ProjectedBlock[] = [userBlock("previous")];
    const turns: ProjectedTurn[] = [{ id: "turn_1", status: "completed", blocks }];
    const optimistic = buildOptimisticTranscript({
      turns,
      optimisticUserMessage: "hello",
      now: () => new Date("2026-05-18T12:34:56.000Z"),
    });

    expect(optimistic).toHaveLength(2);
    expect(optimistic[1]).toEqual({
      id: "optimistic_turn_1779107696000",
      status: "in-progress",
      startTime: "2026-05-18T12:34:56.000Z",
      blocks: [{
        type: "user",
        id: "optimistic_1779107696000",
        content: "hello",
        timestamp: "2026-05-18T12:34:56.000Z",
        isFrozen: true,
      }],
    });
  });

  it("does not duplicate an optimistic message that already arrived from the agent", () => {
    const blocks: ProjectedBlock[] = [userBlock("hello")];
    const turns: ProjectedTurn[] = [{ id: "turn_1", status: "completed", blocks }];

    expect(buildOptimisticTranscript({
      turns,
      optimisticUserMessage: "hello",
    })).toBe(turns);
  });

  it("clears only after the latest real user message matches the optimistic one", () => {
    expect(shouldClearOptimisticMessage(
      [{ id: "t1", status: "completed", blocks: [userBlock("hello")] }],
      "hello",
    )).toBe(true);

    expect(shouldClearOptimisticMessage(
      [
        { id: "t1", status: "completed", blocks: [userBlock("hello")] },
        { id: "t2", status: "completed", blocks: [userBlock("other", "user_2")] }
      ],
      "hello",
    )).toBe(false);
  });
});
