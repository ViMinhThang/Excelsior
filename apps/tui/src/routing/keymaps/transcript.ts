import type { KeyTable } from "./app.js";

export const TRANSCRIPT_KEYS: KeyTable = {
  up: "transcript.scrollUp",
  down: "transcript.scrollDown",
  pageup: "transcript.pageUp",
  pagedown: "transcript.pageDown",
  home: "transcript.scrollTop",
  end: "transcript.scrollBottom",
  "ctrl+f": "transcript.toggleFollow",
  "ctrl+o": "transcript.toggleTools",
  escape: "transcript.focusInput",
  "ctrl+c": "app.exit",
};
