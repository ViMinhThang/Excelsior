import { describe, expect, it } from "vitest";
import {
  getCopyText,
  insertTextAtCursor,
  isCopyShortcut,
  isPasteShortcut,
  sanitizeSingleLinePaste,
} from "../src/lib/input/textInput.js";

describe("clipboard shortcuts", () => {
  it("detects copy and paste shortcuts", () => {
    expect(isCopyShortcut("c", { ctrl: true, shift: true })).toBe(true);
    expect(isCopyShortcut("C", { ctrl: true, shift: true })).toBe(true);
    expect(isCopyShortcut("c", { ctrl: true })).toBe(false);
    expect(isCopyShortcut("c", { meta: true })).toBe(false);
    expect(isPasteShortcut("v", { ctrl: true })).toBe(true);
    expect(isPasteShortcut("v", { meta: true })).toBe(true);
    expect(isCopyShortcut("c", {})).toBeFalsy();
  });

  it("sanitizes pasted text to a single line", () => {
    expect(sanitizeSingleLinePaste("hello\r\nworld")).toBe("hello world");
    expect(sanitizeSingleLinePaste("  spaced  \n  text  ")).toBe("spaced text");
  });

  it("copies the selected range when present", () => {
    expect(getCopyText("hello world", 5, 2)).toBe("llo");
    expect(getCopyText("hello world", 5, null)).toBe("hello world");
  });

  it("replaces the selected range when pasting", () => {
    expect(insertTextAtCursor("hello world", 5, 2, "p")).toEqual({
      value: "hep world",
      cursorOffset: 3,
      selectionAnchor: null,
    });
  });
});
