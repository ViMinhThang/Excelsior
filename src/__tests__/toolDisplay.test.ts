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

  it("keeps successful view results available for explicit expansion", () => {
    const display = createToolDisplay({
      toolName: "view",
      toolArgs: JSON.stringify({ filePath: "package.json" }),
      status: "completed",
      content: "1: {\n2:   \"name\": \"excelsior\"",
    });

    expect(display.showCompletion).toBe(false);
    expect(display.detail).toBeUndefined();
    expect(display.resultPreview).toEqual(["1: {", "2:   \"name\": \"excelsior\""]);
  });

  it("strips legacy ls headers from displayed previews", () => {
    const display = createToolDisplay({
      toolName: "ls",
      toolArgs: JSON.stringify({ directoryPath: "." }),
      status: "completed",
      content: [
        "TYPE | NAME                 | SIZE | MODIFIED",
        "--------------------------------------------------------------------------------",
        "DIR  | src                  | - bytes | 2026-05-17",
      ].join("\n"),
    });

    expect(display.resultPreview).toEqual([
      "DIR  | src                  | - bytes | 2026-05-17",
    ]);
  });

  it("formats default tool without specialized formatter", () => {
    const display = createToolDisplay({
      toolName: "fetch",
      toolArgs: JSON.stringify({ url: "https://example.com" }),
      status: "completed",
      content: "fetched 42 bytes",
    });
    expect(display.label).toBe("fetch");
    expect(display.summary).toContain("url:");
  });

  it("handles null args gracefully", () => {
    const display = createToolDisplay({
      toolName: "runCommand",
      status: "pending",
    });
    expect(display.label).toBe("Run command");
    expect(display.risk).toBe("low");
  });

  it("keeps edit summaries compact while exposing a side-by-side preview", () => {
    const display = createToolDisplay({
      toolName: "edit",
      toolArgs: JSON.stringify({ filePath: "demo.ts" }),
      status: "completed",
      content: [
        "Successfully replaced the block in demo.ts.",
        "--- demo.ts",
        "+++ demo.ts",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
      ].join("\n"),
    });

    expect(display.detail).toBe("demo.ts (+1 -1 lines)");
    expect(display.resultPreview).toBeUndefined();
    expect(display.fileChangePreview).toMatchObject({
      action: "edit",
      oldLines: ["old"],
      newLines: ["new"],
    });
  });

  it("keeps write summaries compact while exposing created file previews", () => {
    const display = createToolDisplay({
      toolName: "write",
      toolArgs: JSON.stringify({ filePath: "created.ts" }),
      status: "completed",
      content: [
        "Successfully wrote 10 characters to created.ts",
        "--- created.ts",
        "+++ created.ts",
        "@@ -1,0 +1,1 @@",
        "+new",
      ].join("\n"),
    });

    expect(display.detail).toBe("created.ts (+1 -0 lines)");
    expect(display.resultPreview).toBeUndefined();
    expect(display.fileChangePreview).toMatchObject({
      action: "create",
      oldLines: [""],
      newLines: ["new"],
    });
  });
});
