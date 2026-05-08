import { describe, expect, it } from "vitest";
import { createToolDisplay, getCommandRisk } from "../tui/lib/toolDisplay.js";

describe("tool display model", () => {
  it("summarizes readFile path and returned line count", () => {
    const display = createToolDisplay({
      toolName: "readFile",
      toolArgs: JSON.stringify({ path: "src/index.ts" }),
      status: "completed",
      content: "one\ntwo\nthree",
    });

    expect(display.label).toBe("Read file");
    expect(display.summary).toBe("src/index.ts");
    expect(display.detail).toBe("returned 3 lines");
    expect(display.tone).toBe("success");
  });

  it("summarizes writeFile and editFile as medium-risk mutations", () => {
    const writeDisplay = createToolDisplay({
      toolName: "writeFile",
      toolArgs: JSON.stringify({ path: "README.md", content: "a\nb" }),
      status: "pending",
    });
    const editDisplay = createToolDisplay({
      toolName: "editFile",
      toolArgs: JSON.stringify({ path: "README.md", search: "old", replace: "new text" }),
      status: "completed",
      content: "Successfully edited README.md",
    });

    expect(writeDisplay.detail).toBe("writing 2 lines");
    expect(writeDisplay.risk).toBe("medium");
    expect(writeDisplay.tone).toBe("pending");
    expect(editDisplay.detail).toBe("replace 3 chars with 8 chars");
    expect(editDisplay.risk).toBe("medium");
  });

  it("summarizes searchFiles matches and preview hits", () => {
    const display = createToolDisplay({
      toolName: "searchFiles",
      toolArgs: JSON.stringify({ query: "target", directory: "src" }),
      status: "completed",
      content: "src/a.ts:1:target one\nsrc/b.ts:2:target two\n",
    });

    expect(display.label).toBe("Search files");
    expect(display.summary).toBe('"target" in src');
    expect(display.detail).toBe("found 2 matches");
    expect(display.resultPreview).toEqual(["src/a.ts:1:target one", "src/b.ts:2:target two"]);
  });

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
    expect(display.detail).toBe("completed");
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
});
