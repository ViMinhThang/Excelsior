import { describe, expect, it } from "vitest";
import { createToolDisplay, getCommandRisk } from "../tui/lib/toolDisplay.js";

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
});
