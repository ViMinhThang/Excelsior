import { describe, expect, it } from "vitest";
import { parseKeyCombo } from "../tui/hooks/useKeymap.js";

describe("parseKeyCombo logic", () => {
  it("correctly parses simple character keypresses", () => {
    expect(parseKeyCombo("y", { ctrl: false, shift: false })).toBe("y");
  });

  it("correctly normalizes Shift+Letter into case-insensitive single binding", () => {
    // Typicall Ink condition for Capital Y: input is "Y", key.shift is true
    expect(parseKeyCombo("Y", { ctrl: false, shift: true })).toBe("y");
  });

  it("preserves Shift modifier on complex combination commands", () => {
    // Ctrl + Shift + U
    expect(parseKeyCombo("U", { ctrl: true, shift: true })).toBe("ctrl+shift+u");
  });

  it("preserves Shift modifier on arrow keys and other named inputs", () => {
    // Shift + Up Arrow
    expect(parseKeyCombo("", { shift: true, upArrow: true })).toBe("shift+up");
  });

  it("properly combines nested control combinations", () => {
    expect(parseKeyCombo("c", { ctrl: true, meta: true })).toBe("ctrl+meta+c");
  });
});
