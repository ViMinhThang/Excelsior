export interface TuiKey {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  return?: boolean;
  escape?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  pageUp?: boolean;
  pageDown?: boolean;
  home?: boolean;
  end?: boolean;
}

const NAMED_KEYS = new Set([
  "return",
  "linefeed",
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

export function isNamedKey(name: string): boolean {
  return NAMED_KEYS.has(name);
}

export function parseKeyCombo(input: string, key: TuiKey): string {
  const combo: string[] = [];

  if (key.ctrl) combo.push("ctrl");
  if (key.meta) combo.push("meta");

  const isLoneLetter = /^[a-zA-Z]$/.test(input) && !key.ctrl && !key.meta;
  if (key.shift && !isLoneLetter) combo.push("shift");

  if (key.upArrow) combo.push("up");
  else if (key.downArrow) combo.push("down");
  else if (key.leftArrow) combo.push("left");
  else if (key.rightArrow) combo.push("right");
  else if (key.return) combo.push("enter");
  else if (key.escape) combo.push("escape");
  else if (key.tab) combo.push("tab");
  else if (key.backspace) combo.push("backspace");
  else if (key.delete) combo.push("delete");
  else if (key.pageUp) combo.push("pageup");
  else if (key.pageDown) combo.push("pagedown");
  else if (key.home) combo.push("home");
  else if (key.end) combo.push("end");
  else if (input) combo.push(input.toLowerCase());

  return combo.join("+");
}
