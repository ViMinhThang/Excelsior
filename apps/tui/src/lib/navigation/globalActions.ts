import type { Screen } from "../../context/NavigationContext.js";
import type { TuiKey } from "../tuiKey.js";

export const GLOBAL_EXIT_KEYMAP_PRIORITY = 200;
export const GLOBAL_NAVIGATION_KEYMAP_PRIORITY = 1;

export function getGlobalNavigationAction(
  input: string,
  key: TuiKey,
  currentScreen: Screen,
): "exit" | "back" | "settings" | null {
  if (key.ctrl && input === "c") return "exit";
  if (key.backspace && currentScreen !== "settings" && currentScreen !== "chat") return "back";
  if (key.ctrl && input === "s" && currentScreen === "chat") return "settings";
  return null;
}
