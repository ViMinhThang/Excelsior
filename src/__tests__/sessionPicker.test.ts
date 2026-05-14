import { describe, expect, it } from "vitest";
import type { Session } from "../lib/runtime/session.js";
import {
  getInitialSessionIndex,
  getSessionDisplayTitle,
  getSessionPickerRows,
  moveSessionSelection,
} from "../features/session/sessionPicker.js";

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
    );

    expect(rows[0]).toContain("Review project architecture");
    expect(rows[0]).not.toContain("ses_secret_123");
  });
});
