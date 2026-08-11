import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileThemeStore, getActiveThemeName, setTheme, setThemeStore, themes } from "../src/theme.js";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "excelsior-theme-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("fileThemeStore", () => {
  it("returns null when the config file does not exist", () => {
    const store = fileThemeStore(join(dir, "missing", "tui-theme.json"));
    expect(store.read()).toBeNull();
  });

  it("round-trips a saved theme", () => {
    const configPath = join(dir, "roundtrip.json");
    const store = fileThemeStore(configPath);
    store.write("ocean");
    expect(store.read()).toBe("ocean");
    expect(JSON.parse(readFileSync(configPath, "utf-8"))).toEqual({ theme: "ocean" });
  });

  it("returns null for malformed config content", () => {
    const configPath = join(dir, "malformed.json");
    const store = fileThemeStore(configPath);
    store.write("excelsior");
    const raw = readFileSync(configPath, "utf-8");
    writeFileSync(configPath, "{ not json", "utf-8");
    expect(store.read()).toBeNull();
    writeFileSync(configPath, raw, "utf-8");
  });

  it("returns null when the stored theme is not a string", () => {
    const configPath = join(dir, "badshape.json");
    const store = fileThemeStore(configPath);
    store.write("excelsior");
    writeFileSync(configPath, '{"theme":42}', "utf-8");
    expect(store.read()).toBeNull();
  });
});

describe("setThemeStore", () => {
  it("applies a saved theme from the injected store", () => {
    setThemeStore(fileThemeStore(join(dir, "injected.json")));
    expect(getActiveThemeName()).toBe("excelsior");
    setThemeStore({
      read: () => Object.keys(themes)[Object.keys(themes).length - 1],
      write: () => {},
    });
    expect(getActiveThemeName()).toBe(Object.keys(themes)[Object.keys(themes).length - 1]);
  });

  it("persists through setTheme", () => {
    const store = fileThemeStore(join(dir, "persisted.json"));
    setThemeStore(store);
    const first = Object.keys(themes)[0];
    setTheme(first);
    expect(getActiveThemeName()).toBe(first);
    expect(store.read()).toBe(first);
  });
});
