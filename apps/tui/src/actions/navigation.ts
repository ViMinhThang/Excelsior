import type { Store } from "../store/store.js";
import type { Screen } from "../store/types.js";
import { nextFocus } from "../routing/focus.js";
import { createSettingsDraft } from "./settings.js";
import { getBridge } from "./bridge.js";
import { register } from "./registry.js";

export function go(store: Store, screen: Screen): void {
  store.dispatch((s) => ({
    ui: { ...s.ui, screen },
  }));
}

export function back(store: Store): void {
  store.dispatch((s) => {
    if (s.ui.screen === "settings") {
      return {
        ui: { ...s.ui, screen: "chat", focus: nextFocus(s.ui.focus, "settings-closed") },
        settingsDraft: null,
      };
    }
    return { ui: s.ui };
  });
}

export function openSettings(store: Store): void {
  store.dispatch((s) => ({
    ui: { ...s.ui, screen: "settings", focus: nextFocus(s.ui.focus, "settings-opened") },
    settingsDraft: createSettingsDraft(s.catalog.settings),
  }));
}

export function refocusInput(store: Store): void {
  store.dispatch((s) => ({ ui: { ...s.ui, focus: nextFocus(s.ui.focus, "refocus") } }));
}

export function blurInput(store: Store): void {
  store.dispatch((s) => ({ ui: { ...s.ui, focus: nextFocus(s.ui.focus, "blur") } }));
}

export function exitApp(_store: Store): void {
  getBridge()?.stop();
  process.exit(0);
}

register("app.openSettings", (store) => openSettings(store));
register("app.back", (store) => back(store));
register("app.exit", (store) => exitApp(store));
register("input.blur", (store) => blurInput(store));
register("transcript.focusInput", (store) => refocusInput(store));
