import { describe, expect, it } from "vitest";
import { shouldIgnoreTextInputKey } from "../tui/components/chat/SafeTextInput.js";

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
});
