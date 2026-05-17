import type { TuiKey } from "./tuiKey.js";

export function parseKeyCombo(input: string, key: TuiKey): string {
  const combo: string[] = [];

  if (key.ctrl) combo.push("ctrl");
  if (key.meta) combo.push("meta");

  const isLoneLetter =
    input && /^[a-zA-Z]$/.test(input) && !key.ctrl && !key.meta;
  if (key.shift && !isLoneLetter) {
    combo.push("shift");
  }

  if (key.upArrow) combo.push("up");
  else if (key.downArrow) combo.push("down");
  else if (key.leftArrow) combo.push("left");
  else if (key.rightArrow) combo.push("right");
  else if (key.return) combo.push("return");
  else if (key.escape) combo.push("escape");
  else if (key.tab) combo.push("tab");
  else if (key.backspace) combo.push("backspace");
  else if (key.delete) combo.push("delete");
  else if (key.pageUp) combo.push("pageup");
  else if (key.pageDown) combo.push("pagedown");
  else if (input) combo.push(input.toLowerCase());

  return combo.join("+");
}
