import { describe, expect, it } from "vitest";
import {
  buildDesktopContextPrompt,
} from "../src/renderer/components/contextRail/contextRailModel.js";

describe("desktop context rail model", () => {
  it("keeps the prompt unchanged when no desktop context is selected", () => {
    expect(buildDesktopContextPrompt({
      basePrompt: "Make the change",
      environment: null,
      notes: "",
    })).toBe("Make the change");
  });

  it("adds environment and notes as hidden context", () => {
    const prompt = buildDesktopContextPrompt({
      basePrompt: "Make the change",
      environment: {
        rootPath: "C:/repo",
        branchName: "codex/context-rail",
        changeCount: 2,
        hasGit: true,
      },
      workspaceName: "Repo",
      notes: "Prefer the desktop renderer.",
    });

    expect(prompt).toContain("## Desktop Context");
    expect(prompt).toContain("Workspace: Repo");
    expect(prompt).toContain("Branch: codex/context-rail");
    expect(prompt).toContain("Prefer the desktop renderer.");
    expect(prompt).toContain("## User Request\nMake the change");
  });
});
