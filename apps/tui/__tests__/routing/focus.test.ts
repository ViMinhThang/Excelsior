import { describe, expect, it } from "vitest";
import { nextFocus } from "../../src/routing/focus.js";

describe("nextFocus", () => {
  it("routes overlay events to overlay", () => {
    expect(nextFocus("input", "confirm-arrived")).toBe("overlay");
    expect(nextFocus("transcript", "question-arrived")).toBe("overlay");
    expect(nextFocus("input", "session-list-opened")).toBe("overlay");
  });

  it("returns to input after overlay dismissal", () => {
    expect(nextFocus("overlay", "overlay-dismissed")).toBe("input");
    expect(nextFocus("input", "overlay-dismissed")).toBe("input");
  });

  it("blurs input to transcript and refocuses back", () => {
    expect(nextFocus("input", "blur")).toBe("transcript");
    expect(nextFocus("transcript", "blur")).toBe("transcript");
    expect(nextFocus("transcript", "refocus")).toBe("input");
  });

  it("handles settings transitions", () => {
    expect(nextFocus("input", "settings-opened")).toBe("settings");
    expect(nextFocus("settings", "settings-closed")).toBe("input");
  });
});
