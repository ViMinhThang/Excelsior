import { describe, expect, it } from "vitest";
import type { CommandDefinition } from "@excelsior/core";
import { getPaletteCommandInput } from "../src/hooks/useCommandPalette.js";

describe("command palette", () => {
  const settings = {
    name: "settings",
    description: "Open settings",
  } satisfies CommandDefinition;
  const session = {
    name: "session",
    description: "Open sessions",
  } satisfies CommandDefinition;

  it("populates settings command input instead of executing immediately", () => {
    expect(getPaletteCommandInput(settings)).toBe("/settings ");
  });

  it("populates session command input so arguments can be edited before submit", () => {
    expect(getPaletteCommandInput(session)).toBe("/session ");
  });

  it("does nothing when no command is selected", () => {
    expect(getPaletteCommandInput(undefined)).toBeNull();
  });
});
