import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/context/systemPrompt.js";

describe("system prompt", () => {
  it("tells Plan mode to avoid write-like runCommand calls", () => {
    const prompt = buildSystemPrompt({ mode: "plan" });

    expect(prompt).toContain("In Plan mode, do not call runCommand");
    expect(prompt).toContain("Use read-only tools only");
  });

  it("instructs Act mode implementation turns to maintain visible tasks", () => {
    const prompt = buildSystemPrompt({ mode: "act" });

    expect(prompt).toContain("call updateTasks before editing");
    expect(prompt).toContain("sticky TUI checklist");
  });
});
