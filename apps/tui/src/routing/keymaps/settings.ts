import type { KeyTable } from "./app.js";

export const SETTINGS_KEYS: KeyTable = {
  up: "settings.navigate:1",
  down: "settings.navigate:-1",
  enter: "settings.toggle",
  tab: "settings.nextField",
  "ctrl+s": "settings.save",
  escape: "settings.back",
  backspace: "settings.back",
  "ctrl+c": "app.exit",
};
