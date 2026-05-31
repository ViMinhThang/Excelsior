import { describe, expect, it } from "vitest";
import type { ProjectedBlock } from "@excelsior/core";
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
    const optimistic = buildOptimisticTranscript({
      displayBlocks: blocks,
      optimisticUserMessage: "hello",
      now: () => new Date("2026-05-18T12:34:56.000Z"),
    });

    expect(optimistic).toHaveLength(2);
    expect(optimistic[1]).toEqual({
      type: "user",
      id: "optimistic_1779107696000",
      content: "hello",
      timestamp: "2026-05-18T12:34:56.000Z",
      isFrozen: true,
    });
  });

  it("does not duplicate an optimistic message that already arrived from the agent", () => {
    const blocks: ProjectedBlock[] = [userBlock("hello")];

    expect(buildOptimisticTranscript({
      displayBlocks: blocks,
      optimisticUserMessage: "hello",
    })).toBe(blocks);
  });

  it("clears only after the latest real user message matches the optimistic one", () => {
    expect(shouldClearOptimisticMessage(
      [userBlock("hello")],
      "hello",
    )).toBe(true);

    expect(shouldClearOptimisticMessage(
      [userBlock("hello"), userBlock("other", "user_2")],
      "hello",
    )).toBe(false);
  });
});
