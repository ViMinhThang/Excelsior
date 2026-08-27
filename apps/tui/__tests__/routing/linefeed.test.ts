import { describe, expect, it } from "vitest";
import { parseKeypress, type KeyEvent } from "@opentui/core";
import { keyEventToTuiKey } from "../../src/platform/opentui/keyAdapter.js";
import { parseKeyCombo } from "../../src/routing/keys.js";
import { resolve } from "../../src/routing/resolve.js";

function parse(seq: string): KeyEvent {
  const parsed = parseKeypress(seq);
  if (!parsed) throw new Error(`unparseable key sequence: ${JSON.stringify(seq)}`);
  return parsed as KeyEvent;
}

describe("Enter delivery as linefeed", () => {
  it("maps a bare \\n keypress to the enter combo", () => {
    const pressed = parse("\n");
    const mapped = keyEventToTuiKey(pressed);
    expect(mapped.key.return).toBe(true);
    expect(mapped.input).toBe("");
    expect(parseKeyCombo(mapped.input, mapped.key)).toBe("enter");
  });

  it("resolves linefeed-Enter to input.submit on the chat input", () => {
    const pressed = parse("\n");
    const mapped = keyEventToTuiKey(pressed);
    const combo = parseKeyCombo(mapped.input, mapped.key);
    const action = resolve({
      focus: "input",
      screen: "chat",
      combo,
      text: null,
      overlayKind: "none",
      questionManual: false,
    });
    expect(action).toBe("input.submit");
  });

  it("does not leak a bare \\r as text", () => {
    const pressed = parse("\r");
    const mapped = keyEventToTuiKey(pressed);
    expect(mapped.input).toBe("");
    expect(mapped.key.return).toBe(true);
  });
});
