import { describe, expect, it } from "vitest";
import type { Session } from "@excelsior/core";
import {
  getInitialSessionIndex,
  getRelativeSessionTime,
  getSessionDisplayTitle,
  getSessionPickerRows,
  SESSION_PICKER_HINT,
  moveSessionSelection,
} from "../../apps/tui/src/features/session/sessionPicker.js";

function session(id: string, title?: string, userInput = ""): Session {
  return {
    id,
    title,
    startedAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    metadata: { userInput },
    workspaceId: "ws_test",
  };
}

describe("session picker helpers", () => {
  it("uses the title or first prompt as the display label", () => {
    expect(getSessionDisplayTitle(session("ses_1", "First prompt"))).toBe("First prompt");
    expect(getSessionDisplayTitle(session("ses_2", undefined, "Fallback prompt"))).toBe("Fallback prompt");
  });

  it("selects the current session initially", () => {
    const sessions = [session("ses_a", "A"), session("ses_b", "B")];
    expect(getInitialSessionIndex(sessions, "ses_b")).toBe(1);
  });

  it("wraps arrow-key selection", () => {
    expect(moveSessionSelection(2, 0, -1)).toBe(1);
    expect(moveSessionSelection(2, 1, 1)).toBe(0);
  });

  it("formats rows without exposing session ids", () => {
    const rows = getSessionPickerRows(
      [session("ses_secret_123", "Review project architecture")],
      0,
      "ses_secret_123",
      Date.parse("2026-05-14T00:01:00.000Z"),
    );

    expect(rows[0]).toContain("Review project architecture");
    expect(rows[0]).toContain("(current)");
    expect(rows[0]).toContain("1m ago");
    expect(rows[0]).not.toContain("ses_secret_123");
  });

  it("formats relative session times", () => {
    expect(getRelativeSessionTime(session("ses_1"), Date.parse("2026-05-14T00:00:30.000Z"))).toBe("just now");
    expect(getRelativeSessionTime(session("ses_1"), Date.parse("2026-05-14T02:00:00.000Z"))).toBe("2h ago");
  });

  it("documents the selected-session delete shortcut", () => {
    expect(SESSION_PICKER_HINT).toContain("Ctrl+D+D remove");
  });
});
