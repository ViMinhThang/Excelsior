import type { KeyEvent } from "@opentui/core";
import type { TuiKey } from "../../lib/tuiKey.js";

const NAMED_KEYS = new Set([
  "return",
  "escape",
  "tab",
  "backspace",
  "delete",
  "up",
  "down",
  "left",
  "right",
  "home",
  "end",
  "pageup",
  "pagedown",
  "space",
]);

function isNamedKey(name: string): boolean {
  return NAMED_KEYS.has(name);
}

export function keyEventToTuiKey(key: KeyEvent): { input: string; key: TuiKey } {
  const tuiKey: TuiKey = {
    ctrl: key.ctrl || undefined,
    meta: key.meta || undefined,
    shift: key.shift || undefined,
    upArrow: key.name === "up",
    downArrow: key.name === "down",
    leftArrow: key.name === "left",
    rightArrow: key.name === "right",
    return: key.name === "return",
    escape: key.name === "escape",
    tab: key.name === "tab",
    backspace: key.name === "backspace",
    delete: key.name === "delete",
    pageUp: key.name === "pageup",
    pageDown: key.name === "pagedown",
  };

  let input = "";
  if (key.name === "space") {
    input = " ";
  } else if (!isNamedKey(key.name)) {
    input = key.name;
  } else if ((key.ctrl || key.meta) && key.name.length === 1) {
    input = key.name;
  }

  return { input, key: tuiKey };
}