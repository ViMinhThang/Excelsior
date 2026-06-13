import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { CommandSuggestions } from "../src/components/chat/CommandSuggestions.js";
import { renderTui } from "../src/platform/opentui/testing/renderTui.js";

describe("CommandSuggestions", () => {
  it("renders slash command suggestions with descriptions", async () => {
    const screen = await renderTui(createElement(CommandSuggestions, {
      commands: [
        { name: "help", description: "List commands" },
        { name: "settings", description: "Open settings" },
      ],
      selectedIndex: 1,
      maxVisibleCount: 10,
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("/help");
    expect(frame).toContain("List commands");
    expect(frame).toContain("/settings");
    expect(frame).toContain("Open settings");
  });

  it("keeps the selected command inside the visible window", async () => {
    const screen = await renderTui(createElement(CommandSuggestions, {
      commands: [
        { name: "help", description: "List commands" },
        { name: "settings", description: "Open settings" },
        { name: "session", description: "Open sessions" },
        { name: "model", description: "Change model" },
        { name: "accept-edits", description: "Toggle edit approval" },
      ],
      selectedIndex: 4,
      maxVisibleCount: 3,
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).not.toContain("/help");
    expect(frame).toContain("/accept-edits");
    expect(frame).toContain("Toggle edit approval");
    expect(frame).toContain("more above");
  });
});
