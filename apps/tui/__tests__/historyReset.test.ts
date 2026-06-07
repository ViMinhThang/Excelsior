import { describe, expect, it } from "vitest";
import type { ProjectedBlock } from "@excelsior/core";
import {
  createHistoryResetSnapshot,
  shouldResetHistory,
} from "../src/hooks/historyReset.js";

const timestamp = "2026-05-18T00:00:00.000Z";

function userBlock(id: string, content = id): ProjectedBlock {
  return {
    type: "user",
    id,
    content,
    timestamp,
  };
}

function assistantBlock(id: string, content = id): ProjectedBlock {
  return {
    type: "assistant",
    id,
    content,
    timestamp,
  };
}

function snapshot(sessionId: string | null, blocks: ProjectedBlock[]) {
  return createHistoryResetSnapshot({ sessionId, blocks });
}

describe("history reset decisions", () => {
  it("does not reset when a same-session submit only grows static history", () => {
    const previous = snapshot("ses_1", [
      userBlock("user_1"),
      assistantBlock("assistant_1"),
    ]);
    const next = snapshot("ses_1", [
      userBlock("user_1"),
      assistantBlock("assistant_1"),
      userBlock("optimistic_1", "next"),
    ]);

    expect(shouldResetHistory(previous, next)).toBe(false);
  });

  it("does not reset when an optimistic user block is replaced by the real one", () => {
    const previous = snapshot("ses_1", [
      userBlock("user_1"),
      assistantBlock("assistant_1"),
      userBlock("optimistic_1", "next"),
    ]);
    const next = snapshot("ses_1", [
      userBlock("user_1"),
      assistantBlock("assistant_1"),
      userBlock("user_2", "next"),
    ]);

    expect(shouldResetHistory(previous, next)).toBe(false);
  });

  it("resets when switching sessions", () => {
    const previous = snapshot("ses_1", [
      userBlock("user_1"),
      assistantBlock("assistant_1"),
      userBlock("user_2"),
    ]);
    const next = snapshot("ses_2", [
      userBlock("user_3"),
      assistantBlock("assistant_3"),
      userBlock("user_4"),
    ]);

    expect(shouldResetHistory(previous, next)).toBe(true);
  });

  it("resets when the active session id changes even before static history exists", () => {
    const previous = snapshot(null, []);
    const next = snapshot("ses_1", [userBlock("user_1")]);

    expect(shouldResetHistory(previous, next)).toBe(true);
  });

  it("resets when same-session static history shrinks or is replaced", () => {
    const previous = snapshot("ses_1", [
      userBlock("user_1"),
      assistantBlock("assistant_1"),
      userBlock("user_2"),
      assistantBlock("assistant_2"),
      userBlock("user_3"),
    ]);

    expect(shouldResetHistory(previous, snapshot("ses_1", []))).toBe(true);
    expect(shouldResetHistory(previous, snapshot("ses_1", [
      userBlock("user_4"),
      assistantBlock("assistant_4"),
      userBlock("user_5"),
    ]))).toBe(true);
  });
});
