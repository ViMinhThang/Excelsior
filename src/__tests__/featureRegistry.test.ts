import { describe, expect, it } from "vitest";
import { createFeatureRegistry } from "../features/featureRegistry.js";
import type { AppFeature } from "../features/featureTypes.js";

function feature(id: string, commandName: string): AppFeature {
  return {
    id,
    commands: [
      {
        name: commandName,
        description: `${commandName} command`,
        execute: () => {},
      },
    ],
  };
}

describe("feature registry", () => {
  it("rejects duplicate command names", () => {
    expect(() => createFeatureRegistry([
      feature("a", "same"),
      feature("b", "same"),
    ])).toThrow("Duplicate slash command");
  });

  it("returns registered commands for autocomplete and execution", () => {
    const registry = createFeatureRegistry([
      feature("core", "help"),
      feature("session", "session"),
    ]);

    expect(registry.getCommands().map((command) => command.name)).toEqual(["help", "session"]);
    expect(registry.findCommand("session")?.description).toBe("session command");
  });

  it("generates help text from registered features", () => {
    const registry = createFeatureRegistry([feature("core", "help")]);
    expect(registry.getHelpText()).toBe("Available commands:\n/help - help command");
  });
});
