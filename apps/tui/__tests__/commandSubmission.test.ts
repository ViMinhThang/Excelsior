import { describe, expect, it } from "vitest";
import {
  getSubmittedCommand,
  shouldAllowChatInputSubmit,
} from "../src/lib/commandSubmission.js";
import type { CommandDefinition } from "@excelsior/core";

describe("command submission", () => {
  const commands = [
    { name: "review", description: "" },
    { name: "review-post", description: "" },
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

  it("does not submit a bare slash while opening command suggestions", () => {
    expect(getSubmittedCommand("/")).toBeNull();
    expect(getSubmittedCommand("  /  ")).toBeNull();
  });

  it("blocks chat input submit while slash suggestions are visible", () => {
    expect(shouldAllowChatInputSubmit("/write-a-skill", {
      show: true,
      filtered: [{ name: "write-a-skill", description: "Create a skill" }],
    })).toBe(false);
  });

  it("allows chat input submit for unmatched slash commands", () => {
    expect(shouldAllowChatInputSubmit("/not-real", {
      show: true,
      filtered: [],
    })).toBe(true);
  });
});
