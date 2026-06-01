import { describe, expect, it } from "vitest";
import {
  defaultThemeForMode,
  getThemeOption,
  isThemeDark,
  themeOptionsForMode,
} from "../src/renderer/components/settingsDialog/themeOptions.js";

describe("settings theme options", () => {
  it("maps themes to their visual mode", () => {
    expect(isThemeDark("one-dark-pro")).toBe(true);
    expect(isThemeDark("tokyo-night")).toBe(true);
    expect(isThemeDark("gruvbox")).toBe(false);
    expect(isThemeDark("tokyo-night-light")).toBe(false);
  });

  it("selects mode defaults and visible options", () => {
    expect(defaultThemeForMode(true)).toBe("one-dark-pro");
    expect(defaultThemeForMode(false)).toBe("gruvbox");
    expect(themeOptionsForMode(true).map((option) => option.id)).toEqual([
      "one-dark-pro",
      "tokyo-night",
    ]);
    expect(themeOptionsForMode(false).map((option) => option.id)).toEqual([
      "gruvbox",
      "tokyo-night-light",
    ]);
  });

  it("exposes color metadata for selected swatches", () => {
    expect(getThemeOption("tokyo-night-light")).toMatchObject({
      name: "Tokyo Night Light",
      valueHash: "#385AF6",
    });
  });
});
