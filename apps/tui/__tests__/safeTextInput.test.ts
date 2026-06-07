import { describe, expect, it } from "vitest";
import {
  applyTextInputKey,
  getSingleLineInputPreview,
  shouldIgnoreTextInputKey,
} from "../src/lib/input/textInput.js";
import { keyEventToTuiKey } from "../src/platform/opentui/keyAdapter.js";

describe("SafeTextInput", () => {
  it("ignores ctrl-letter input so shortcuts do not leak into chat text", () => {
    expect(shouldIgnoreTextInputKey("o", { ctrl: true })).toBe(true);
  });

  it("allows return through the text input layer", () => {
    expect(shouldIgnoreTextInputKey("", { return: true })).toBe(false);
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

  it("maps the space key to a literal space character", () => {
    expect(keyEventToTuiKey({ name: "space", ctrl: false, meta: false, shift: false } as never).input).toBe(" ");
  });

  it("clamps cursor movement after applying arrow keys", () => {
    expect(applyTextInputKey("abc", 0, null, "", { leftArrow: true }, true)).toEqual({
      value: "abc",
      cursorOffset: 0,
      selectionAnchor: null,
      cursorWidth: 0,
    });
    expect(applyTextInputKey("abc", 3, null, "", { rightArrow: true }, true)).toEqual({
      value: "abc",
      cursorOffset: 3,
      selectionAnchor: null,
      cursorWidth: 0,
    });
  });

  it("extends selection with shift+arrow keys", () => {
    expect(applyTextInputKey("abc", 2, null, "", { leftArrow: true, shift: true }, true)).toEqual({
      value: "abc",
      cursorOffset: 1,
      selectionAnchor: 2,
      cursorWidth: 0,
    });
  });
});