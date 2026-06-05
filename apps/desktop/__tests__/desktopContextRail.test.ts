import { describe, expect, it } from "vitest";
import type { ProjectedBlock } from "@excelsior/core";
import {
  buildDesktopContextPrompt,
  buildDesktopContextSnippets,
  selectedDesktopContextSnippets,
  togglePinnedSnippetId,
} from "../src/renderer/components/contextRail/contextRailModel.js";

function block(input: {
  id: string;
  type: "user" | "assistant" | "tool-call";
  content: string;
}): ProjectedBlock {
  if (input.type === "tool-call") {
    return {
      id: input.id,
      type: "tool-call",
      toolName: "writeFile",
      toolArgs: "{}",
      status: "completed",
      content: input.content,
      timestamp: "2026-06-05T00:00:00.000Z",
    };
  }

  return {
    id: input.id,
    type: input.type,
    content: input.content,
    timestamp: "2026-06-05T00:00:00.000Z",
  };
}

describe("desktop context rail model", () => {
  it("builds context snippets from recent user and assistant messages only", () => {
    const snippets = buildDesktopContextSnippets([
      block({ id: "user_1", type: "user", content: "Review this file" }),
      block({ id: "tool_1", type: "tool-call", content: "Wrote file" }),
      block({ id: "assistant_1", type: "assistant", content: "Found a regression" }),
    ]);

    expect(snippets).toEqual([
      {
        id: "user_1",
        role: "user",
        title: "You: Review this file",
        content: "Review this file",
      },
      {
        id: "assistant_1",
        role: "assistant",
        title: "Assistant: Found a regression",
        content: "Found a regression",
      },
    ]);
  });

  it("toggles and selects pinned snippets by id", () => {
    const snippets = buildDesktopContextSnippets([
      block({ id: "user_1", type: "user", content: "First" }),
      block({ id: "assistant_1", type: "assistant", content: "Second" }),
    ]);

    const pinned = togglePinnedSnippetId([], "assistant_1");

    expect(pinned).toEqual(["assistant_1"]);
    expect(togglePinnedSnippetId(pinned, "assistant_1")).toEqual([]);
    expect(selectedDesktopContextSnippets(snippets, pinned)).toEqual([snippets[1]]);
  });

  it("keeps the prompt unchanged when no desktop context is selected", () => {
    expect(buildDesktopContextPrompt({
      basePrompt: "Make the change",
      environment: null,
      pinnedSnippets: [],
      notes: "",
    })).toBe("Make the change");
  });

  it("adds environment, pinned messages, and notes as hidden context", () => {
    const prompt = buildDesktopContextPrompt({
      basePrompt: "Make the change",
      environment: {
        rootPath: "C:/repo",
        branchName: "codex/context-rail",
        changeCount: 2,
        hasGit: true,
      },
      workspaceName: "Repo",
      pinnedSnippets: [{
        id: "assistant_1",
        role: "assistant",
        title: "Assistant: Finding",
        content: "Found a failing test.",
      }],
      notes: "Prefer the desktop renderer.",
    });

    expect(prompt).toContain("## Desktop Context");
    expect(prompt).toContain("Workspace: Repo");
    expect(prompt).toContain("Branch: codex/context-rail");
    expect(prompt).toContain("- Assistant: Found a failing test.");
    expect(prompt).toContain("Prefer the desktop renderer.");
    expect(prompt).toContain("## User Request\nMake the change");
  });
});
