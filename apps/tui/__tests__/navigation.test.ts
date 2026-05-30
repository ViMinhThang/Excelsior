import { describe, expect, it } from "vitest";
import { getGlobalNavigationAction } from "../src/components/navigation/Router.js";

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
});
