import { describe, expect, it } from "vitest";
import { completeCommandInput, getSubmittedCommand } from "../../apps/tui/src/lib/commandSubmission.js";
import type { CommandDefinition } from "@excelsior/core";

describe("command submission", () => {
  const commands = [
    { name: "review", description: "", execute: () => {} },
    { name: "review-post", description: "", execute: () => {} },
  ] satisfies CommandDefinition[];

  it("submits the exact slash command including arguments", () => {
    expect(getSubmittedCommand("/review 42")).toBe("/review 42");
    expect(getSubmittedCommand("/review-post 42 hello")).toBe("/review-post 42 hello");
  });

  it("submits unknown slash commands to command handling", () => {
    expect(getSubmittedCommand("/not-real arg")).toBe("/not-real arg");
  });

  it("does not treat normal chat as a command", () => {
    expect(getSubmittedCommand("review 42")).toBeNull();
  });

  it("completes the selected autocomplete command explicitly", () => {
    expect(completeCommandInput(commands, 1)).toBe("/review-post ");
  });
});
