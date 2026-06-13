import { createElement } from "react";
import { describe, expect, it } from "vitest";
import AppHeader from "../src/components/shared/AppHeader.js";
import { renderTui } from "../src/platform/opentui/testing/renderTui.js";

describe("AppHeader", () => {
  it("renders workspace folder on the left and provider model on the right", async () => {
    const screen = await renderTui(createElement(AppHeader, {
      workspaceName: "Excelsior",
      branchName: "codex/tui-polish",
      modelLabel: "DeepSeek · deepseek-v4-flash",
      contextLabel: "memory on · AGENTS.md loaded · 2 skills · 14.0k transcript",
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("Excelsior");
    expect(frame).toContain("codex/tui-polish");
    expect(frame).toContain("DeepSeek · deepseek-v4-flash");
    expect(frame).toContain("memory on");
    expect(frame).toContain("2 skills");
  });
});
