import { describe, expect, it } from "vitest";
import { getSingleLineInputPreview, shouldIgnoreTextInputKey } from "../tui/components/chat/SafeTextInput.js";

describe("SafeTextInput", () => {
  it("ignores ctrl-letter input so shortcuts do not leak into chat text", () => {
    expect(shouldIgnoreTextInputKey("o", { ctrl: true })).toBe(true);
  });

  it("keeps normal printable input editable", () => {
    expect(shouldIgnoreTextInputKey("o", { ctrl: false, meta: false })).toBe(false);
  });

  it("ignores meta-letter input so terminal shortcuts do not leak into chat text", () => {
    expect(shouldIgnoreTextInputKey("o", { meta: true })).toBe(true);
  });

  it("renders only the active input line", () => {
    expect(getSingleLineInputPreview("first\nsecond line\nthird", 9, 80)).toEqual({
      text: "second line",
      cursorOffset: 3,
    });
  });

  it("truncates long input previews to one compact line", () => {
    const preview = getSingleLineInputPreview("x".repeat(120), 120, 24);

    expect(preview.text.length).toBeLessThanOrEqual(24);
    expect(preview.text).toContain("...");
  });
});
