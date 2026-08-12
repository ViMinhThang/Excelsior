import type { KeyTable } from "./app.js";

export const CONFIRM_KEYS: KeyTable = {
  y: "confirm.approve",
  n: "confirm.deny",
  a: "confirm.approveAll",
  escape: "overlay.dismiss",
  "ctrl+c": "app.exit",
};

const QUESTION_DIGITS: KeyTable = {
  "1": "question.select:0",
  "2": "question.select:1",
  "3": "question.select:2",
  "4": "question.select:3",
  "5": "question.select:4",
  "6": "question.select:5",
  "7": "question.select:6",
  "8": "question.select:7",
  "9": "question.select:8",
};

export const QUESTION_KEYS: KeyTable = {
  ...QUESTION_DIGITS,
  up: "question.selectPrev",
  down: "question.selectNext",
  enter: "question.submit",
  escape: "question.cancel",
  backspace: "question.backspace",
  "ctrl+c": "app.exit",
};

export const SESSION_LIST_KEYS: KeyTable = {
  up: "session-list.move:1",
  down: "session-list.move:-1",
  enter: "session-list.switch",
  d: "session-list.delete",
  n: "session-list.create",
  escape: "overlay.dismiss",
  "ctrl+c": "app.exit",
};
