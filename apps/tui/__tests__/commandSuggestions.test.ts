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
});