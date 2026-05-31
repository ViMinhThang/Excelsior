import { describe, expect, it, vi } from "vitest";
import type { Session } from "@excelsior/core";
import {
  groupSessions,
  sessionTitle,
} from "../src/renderer/components/workspaceSidebar/sessionListModel.js";

function session(id: string, updatedAt: string, title?: string, userInput = ""): Session {
  return {
    id,
    startedAt: updatedAt,
    updatedAt,
    title,
    metadata: { userInput },
  };
}

describe("workspace sidebar session list model", () => {
  it("uses explicit titles before compacting user input", () => {
    expect(sessionTitle(session("1", "2026-05-31T00:00:00.000Z", "Named"))).toBe("Named");
    expect(sessionTitle(session("2", "2026-05-31T00:00:00.000Z", undefined, "hello   world"))).toBe("hello world");
    expect(sessionTitle(session("3", "2026-05-31T00:00:00.000Z"))).toBe("New chat");
  });

  it("groups sessions by recency and sorts newest first inside each group", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T12:00:00.000Z"));

    try {
      const groups = groupSessions([
        session("older", "2026-05-10T10:00:00.000Z"),
        session("today-old", "2026-05-31T08:00:00.000Z"),
        session("today-new", "2026-05-31T11:00:00.000Z"),
        session("yesterday", "2026-05-30T12:00:00.000Z"),
        session("previous7", "2026-05-26T12:00:00.000Z"),
      ]);

      expect(groups.map((group) => group.key)).toEqual([
        "today",
        "yesterday",
        "previous7",
        "older",
      ]);
      expect(groups[0].items.map((item) => item.id)).toEqual(["today-new", "today-old"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
