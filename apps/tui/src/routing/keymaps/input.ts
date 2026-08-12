import type { KeyTable } from "./app.js";

export const CHAT_INPUT_KEYS: KeyTable = {
  enter: "input.submit",
  escape: "input.blur",
  up: "input.historyUp",
  down: "input.historyDown",
  tab: "input.insertCommand",
  backspace: "input.backspace",
  left: "input.moveLeft",
  right: "input.moveRight",
  home: "input.moveHome",
  end: "input.moveEnd",
  "ctrl+a": "input.moveHome",
  "ctrl+e": "input.moveEnd",
  "ctrl+u": "input.clearLine",
  "ctrl+k": "input.killLine",
  "ctrl+w": "input.deleteWord",
  "ctrl+c": "app.exit",
};
