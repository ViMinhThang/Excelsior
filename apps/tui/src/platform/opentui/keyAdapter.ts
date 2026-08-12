import type { KeyEvent } from "@opentui/core";
import { isNamedKey, type TuiKey } from "../../routing/keys.js";

export interface MappedKey {
  input: string;
  key: TuiKey;
}

export function keyEventToTuiKey(key: KeyEvent): MappedKey {
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
    home: key.name === "home",
    end: key.name === "end",
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
