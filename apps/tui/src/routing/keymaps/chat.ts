import type { KeyTable } from "./app.js";

export const CHAT_KEYS: KeyTable = {
  "ctrl+s": "app.openSettings",
  "ctrl+p": "app.openSessions",
  "ctrl+n": "app.newSession",
  "ctrl+d": "app.deleteSession",
  "ctrl+o": "transcript.toggleTools",
  tab: "app.toggleMode",
  "shift+tab": "app.toggleMode",
  pageup: "transcript.pageUp",
  pagedown: "transcript.pageDown",
  "ctrl+up": "transcript.scrollUp",
  "ctrl+down": "transcript.scrollDown",
};
