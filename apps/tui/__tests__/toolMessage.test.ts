import { createElement } from "react";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { createToolDisplay } from "@excelsior/core";
import ToolMessage from "../src/components/chat/ToolMessage.js";

function commandFor(toolName: string, args: Record<string, unknown>): string {
  return createToolDisplay({
    toolName,
    toolArgs: JSON.stringify(args),
  }).command;
}

describe("ToolMessage command formatting", () => {
  it("shows view calls with the full path", () => {
    const filePath = ["packages", "agent-harness", "src", "runController.ts"].join("/");
    expect(commandFor(
      "view",
      { filePath },
    )).toBe("read(" + filePath + ")");
  });

  it("does not show quoted JSON args for view calls", () => {
    const filePath = ["packages", "agent-host", "src", "host", "HarnessAgentHost.ts"].join("/");
    expect(commandFor(
      "view",
      { filePath },
    )).toBe("read(" + filePath + ")");
  });

  it("shows ls calls with the directory path value only", () => {
    const directoryPath = ["packages", "agent-host", "src", "application"].join("/");

    expect(commandFor(
      "ls",
      { directoryPath },
    )).toBe(`Listfiles(${directoryPath})`);
  });

  it("renders expanded edit output as old and new panes", () => {
    const screen = render(createElement(ToolMessage, {
      toolName: "edit",
      toolArgs: JSON.stringify({ filePath: "demo.ts" }),
      status: "completed",
      expanded: true,
      content: [
        "Successfully replaced the block in demo.ts.",
        "--- demo.ts",
        "+++ demo.ts",
        "@@ -1,3 +1,3 @@",
        " const label = \"demo\";",
        "-const state = \"old\";",
        "+const state = \"new\";",
        " export { state };",
      ].join("\n"),
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("edit(demo.ts)");
    expect(frame).toContain("completed edit: demo.ts");
    expect(frame).toContain("(+1)");
    expect(frame).toContain("(-1)");
    expect(frame).toContain("old");
    expect(frame).toContain("new");
    expect(frame).toContain("const state = \"old\";");
    expect(frame).toContain("const state = \"new\";");
  });

  it("renders pending write progress in the expandable tool row", () => {
    const partialArgs = [
      "{\"filePath\":\"report.html\",\"content\":\"<html>",
      "\\n<body>",
      "\\n<h1>Report",
    ].join("");

    const collapsed = render(createElement(ToolMessage, {
      toolName: "write",
      toolArgs: partialArgs,
      status: "pending",
      expanded: false,
    }));
    expect(collapsed.lastFrame()).toContain("Writing...");
    expect(collapsed.lastFrame()).toContain("(Ctrl+O to expand)");

    const expanded = render(createElement(ToolMessage, {
      toolName: "write",
      toolArgs: partialArgs,
      status: "pending",
      expanded: true,
    }));
    const frame = expanded.lastFrame() ?? "";
    expect(frame).toContain("Writing...");
    expect(frame).toContain("target: report.html");
    expect(frame).toContain("received");
    expect(frame).toContain("<html>");
    expect(frame).toContain("<body>");
  });

  it("shows edit panes by default without the collapsed summary", () => {
    const screen = render(createElement(ToolMessage, {
      toolName: "edit",
      toolArgs: JSON.stringify({ filePath: "demo.ts" }),
      status: "completed",
      expanded: true,
      content: [
        "Successfully replaced the block in demo.ts.",
        "--- demo.ts",
        "+++ demo.ts",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
      ].join("\n"),
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("edit(demo.ts)");
    expect(frame).toContain("completed edit: demo.ts");
    expect(frame).toContain("(+1)");
    expect(frame).toContain("(-1)");
    expect(frame).toContain("old");
    expect(frame).toContain("new");
  });

  it("does not render an omitted rows footer for file changes", () => {
    const lines = Array.from({ length: 20 }, (_, index) => [
      `-old ${index}`,
      `+new ${index}`,
    ]).flat();
    const screen = render(createElement(ToolMessage, {
      toolName: "edit",
      toolArgs: JSON.stringify({ filePath: "many.ts" }),
      status: "completed",
      expanded: true,
      content: [
        "Successfully replaced the block in many.ts.",
        "--- many.ts",
        "+++ many.ts",
        "@@ -1,20 +1,20 @@",
        ...lines,
      ].join("\n"),
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("old 19");
    expect(frame).toContain("new 19");
    expect(frame).not.toContain("more rows");
  });

  it("keeps pane content full instead of replacing long lines with ellipses", () => {
    const oldLine = "const previousValue = \"this should remain visible\";";
    const newLine = "const nextValue = \"this should also remain visible\";";
    const screen = render(createElement(ToolMessage, {
      toolName: "edit",
      toolArgs: JSON.stringify({ filePath: "wide.ts" }),
      status: "completed",
      expanded: true,
      content: [
        "Successfully replaced the block in wide.ts.",
        "--- wide.ts",
        "+++ wide.ts",
        "@@ -1,1 +1,1 @@",
        `-${oldLine}`,
        `+${newLine}`,
      ].join("\n"),
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("const previousValue =");
    expect(frame).toContain("visible\";");
    expect(frame).toContain("const nextValue =");
    expect(frame).toContain("should also");
    expect(frame).toContain("remain visible\";");
    expect(frame).not.toContain("...");
  });
});
