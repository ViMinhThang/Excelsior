import { describe, expect, it } from "vitest";
import { isNamedKey, parseKeyCombo, type TuiKey } from "../../src/routing/keys.js";

function combo(input: string, key: TuiKey = {}): string {
  return parseKeyCombo(input, key);
}

describe("parseKeyCombo", () => {
  it("maps plain characters to text", () => {
    expect(combo("a")).toBe("a");
    expect(combo("A")).toBe("a");
    expect(combo(" ")).toBe(" ");
  });

  it("maps named keys without modifiers", () => {
    expect(combo("", { return: true })).toBe("enter");
    expect(combo("", { tab: true })).toBe("tab");
    expect(combo("", { escape: true })).toBe("escape");
    expect(combo("", { upArrow: true })).toBe("up");
    expect(combo("", { pageUp: true })).toBe("pageup");
    expect(combo("", { pageDown: true })).toBe("pagedown");
    expect(combo("", { home: true })).toBe("home");
    expect(combo("", { end: true })).toBe("end");
    expect(combo("", { backspace: true })).toBe("backspace");
  });

  it("maps ctrl+letter and meta+letter combos", () => {
    expect(combo("c", { ctrl: true })).toBe("ctrl+c");
    expect(combo("s", { ctrl: true })).toBe("ctrl+s");
    expect(combo("f", { meta: true })).toBe("meta+f");
  });

  it("maps ctrl+shift and ctrl+meta combos", () => {
    expect(combo("s", { ctrl: true, shift: true })).toBe("ctrl+shift+s");
    expect(combo("f", { ctrl: true, meta: true })).toBe("ctrl+meta+f");
  });

  it("does not add a shift modifier to a lone letter", () => {
    expect(combo("a", { shift: true })).toBe("a");
  });

  it("returns an empty combo for an unmapped named key", () => {
    expect(combo("")).toBe("");
  });
});

describe("isNamedKey", () => {
  it("recognizes named keys and rejects plain text", () => {
    expect(isNamedKey("return")).toBe(true);
    expect(isNamedKey("up")).toBe(true);
    expect(isNamedKey("space")).toBe(true);
    expect(isNamedKey("a")).toBe(false);
    expect(isNamedKey(" ")).toBe(false);
  });
});
