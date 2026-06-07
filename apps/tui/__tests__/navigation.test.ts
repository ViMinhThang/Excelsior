import { describe, expect, it } from "vitest";
import {
  getGlobalNavigationAction,
  GLOBAL_EXIT_KEYMAP_PRIORITY,
  GLOBAL_NAVIGATION_KEYMAP_PRIORITY,
} from "../src/lib/navigation/globalActions.js";
import { resolveKeyAction, type KeymapEntry } from "../src/lib/keymapRegistry.js";

describe("global navigation keys", () => {
  it("does not leave settings when typing c", () => {
    expect(getGlobalNavigationAction("c", { ctrl: false }, "settings")).toBeNull();
  });

  it("keeps escape as a screen-local settings action", () => {
    expect(getGlobalNavigationAction("", { escape: true }, "settings")).toBeNull();
  });

  it("keeps ctrl+s as the chat settings shortcut", () => {
    expect(getGlobalNavigationAction("s", { ctrl: true }, "chat")).toBe("settings");
  });

  it("gives ctrl+c exit priority over focused input copy", () => {
    const exit: KeymapEntry = {
      priority: GLOBAL_EXIT_KEYMAP_PRIORITY,
      enabled: true,
      getMap: () => ({ "ctrl+c": () => {} }),
    };
    const inputCopy: KeymapEntry = {
      priority: 150,
      enabled: true,
      getMap: () => ({ "ctrl+c": () => {} }),
    };
    const settings: KeymapEntry = {
      priority: GLOBAL_NAVIGATION_KEYMAP_PRIORITY,
      enabled: true,
      getMap: () => ({ "ctrl+s": () => {} }),
    };

    expect(resolveKeyAction([settings, inputCopy, exit], "ctrl+c")?.entry)
      .toBe(exit);
  });
});
