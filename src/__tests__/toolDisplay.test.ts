import { describe, expect, it } from "vitest";
import { createToolDisplay, getCommandRisk } from "../../apps/tui/src/lib/toolDisplay.js";

describe("tool display model", () => {
  it("summarizes runCommand risk, result, and errors", () => {
    const display = createToolDisplay({
      toolName: "runCommand",
      toolArgs: JSON.stringify({ command: "npm test" }),
      status: "completed",
      content: "Tests passed\nMore output",
    });
    const errorDisplay = createToolDisplay({
      toolName: "runCommand",
      toolArgs: JSON.stringify({ command: "nonexistent" }),
      status: "error",
      content: "[Error] command failed",
    });

    expect(display.summary).toBe("npm test");
    expect(display.risk).toBe("low");
    expect(display.detail).toBeUndefined();
    expect(display.resultPreview).toEqual(["Tests passed", "More output"]);
    expect(errorDisplay.tone).toBe("error");
  });

  it("classifies command risk", () => {
    expect(getCommandRisk("ls -la")).toBe("low");
    expect(getCommandRisk("npm install")).toBe("medium");
    expect(getCommandRisk("rm -rf /")).toBe("high");
  });

  it("falls back safely for malformed JSON args", () => {
    const display = createToolDisplay({
      toolName: "unknownTool",
      toolArgs: "{bad json",
      status: "completed",
      content: "small result",
    });

    expect(display.label).toBe("unknownTool");
    expect(display.summary).toBe("bad json");
    expect(display.detail).toBe("small result");
  });

  it("treats denied tool calls as errors", () => {
    const display = createToolDisplay({
      toolName: "writeFile",
      toolArgs: JSON.stringify({ path: "x.ts", content: "x" }),
      status: "completed",
      content: "Denied by user.",
    });

    expect(display.tone).toBe("error");
  });

  it("formats gitDiff tool correctly", () => {
    const display = createToolDisplay({
      toolName: "gitDiff",
      toolArgs: JSON.stringify({ prNumber: 42 }),
      status: "completed",
      content: "diff --git a/src/x.ts b/src/x.ts\nindex abc..def\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1 +1 @@\n-old\n+new",
    });
    expect(display.label).toBe("Git diff");
    expect(display.detail).toContain("line");
  });

  it("formats default tool without specialized formatter", () => {
    const display = createToolDisplay({
      toolName: "write",
      toolArgs: JSON.stringify({ path: "/tmp/x.txt" }),
      status: "completed",
      content: "wrote 42 bytes",
    });
    expect(display.label).toBe("write");
    expect(display.summary).toBe("path: /tmp/x.txt");
  });

  it("handles null args gracefully", () => {
    const display = createToolDisplay({
      toolName: "runCommand",
      status: "pending",
    });
    expect(display.label).toBe("Run command");
    expect(display.risk).toBe("low");
  });
});
