import { describe, expect, it } from "vitest";
import {
  defaultThemeForMode,
  getThemeOption,
  isDesktopTheme,
  isThemeDark,
  themeOptionsForMode,
} from "../src/renderer/components/settingsDialog/themeOptions.js";

describe("settings theme options", () => {
  it("maps themes to their visual mode", () => {
    expect(isThemeDark("excelsior")).toBe(true);
    expect(isThemeDark("one-dark-pro")).toBe(true);
    expect(isThemeDark("tokyo-night")).toBe(true);
    expect(isThemeDark("nordic-blue")).toBe(true);
    expect(isThemeDark("rose-pine-dark")).toBe(true);
    expect(isThemeDark("gruvbox")).toBe(false);
    expect(isThemeDark("tokyo-night-light")).toBe(false);
    expect(isThemeDark("rose-pine-light")).toBe(false);
  });

  it("selects mode defaults and visible options", () => {
    expect(defaultThemeForMode(true)).toBe("excelsior");
    expect(defaultThemeForMode(false)).toBe("gruvbox");
    expect(themeOptionsForMode(true).map((option) => option.id)).toEqual([
      "excelsior",
      "one-dark-pro",
      "tokyo-night",
      "nordic-blue",
      "rose-pine-dark",
    ]);
    expect(themeOptionsForMode(false).map((option) => option.id)).toEqual([
      "gruvbox",
      "tokyo-night-light",
      "rose-pine-light",
    ]);
  });

  it("validates stored theme ids from the theme option list", () => {
    expect(isDesktopTheme("excelsior")).toBe(true);
    expect(isDesktopTheme("one-dark-pro")).toBe(true);
    expect(isDesktopTheme("missing-theme")).toBe(false);
    expect(isDesktopTheme(null)).toBe(false);
  });

  it("exposes color metadata for selected swatches", () => {
    expect(getThemeOption("excelsior")).toMatchObject({
      name: "Excelsior",
      valueHash: "#A89468",
    });
    expect(getThemeOption("tokyo-night-light")).toMatchObject({
      name: "Tokyo Night Light",
      valueHash: "#385AF6",
    });
  });
});
