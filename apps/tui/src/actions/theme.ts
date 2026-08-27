import type { Store } from "../store/store.js";
import { DEFAULT_THEME_NAME, THEMES } from "../theme/tokens.js";
import { register } from "./registry.js";

export function setTheme(store: Store, name: string): void {
  const tokens = THEMES[name];
  if (!tokens) return;
  store.dispatch((_s) => ({ theme: { name, tokens } }));
}

export function resetTheme(store: Store): void {
  setTheme(store, DEFAULT_THEME_NAME);
}

register("theme.set", (store, arg) => setTheme(store, arg ?? DEFAULT_THEME_NAME));
register("theme.reset", (store) => resetTheme(store));
