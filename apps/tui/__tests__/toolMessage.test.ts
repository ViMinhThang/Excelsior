import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { createToolDisplay } from "@excelsior/core";
import ToolMessage from "../src/components/chat/ToolMessage.js";
import { renderTui } from "../src/platform/opentui/testing/renderTui.js";

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

  it("renders expanded edit output with highlighted diff rows", async () => {
    const screen = await renderTui(createElement(ToolMessage, {
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
    expect(frame).toContain("Edit");
    expect(frame).toContain("demo.ts");
    expect(frame).not.toContain("completed edit:");
    expect(frame).toContain("const label = \"demo\";");
    expect(frame).toContain("const state = \"old\";");
    expect(frame).toContain("const state = \"new\";");
  });

  it("renders pending write progress as colored line stats when expanded", async () => {
    const partialArgs = [
      "{\"filePath\":\"report.html\",\"content\":\"<html>",
      "\\n<body>",
      "\\n<h1>Report",
    ].join("");

    const collapsed = await renderTui(createElement(ToolMessage, {
      toolName: "write",
      toolArgs: partialArgs,
      status: "pending",
      expanded: false,
    }));
    expect(collapsed.lastFrame()).toContain("Writing...");
    expect(collapsed.lastFrame()).toContain("(Ctrl+O to expand)");

    const expanded = await renderTui(createElement(ToolMessage, {
      toolName: "write",
      toolArgs: partialArgs,
      status: "pending",
      expanded: true,
    }));
    const frame = expanded.lastFrame() ?? "";
    expect(frame).toContain("Writing...");
    expect(frame).toContain("write");
    expect(frame).toContain("+3");
    expect(frame).toContain("-0");
    expect(frame).toContain("lines");
    expect(frame).not.toContain("target:");
    expect(frame).not.toContain("received");
    expect(frame).not.toContain("<html>");
    expect(frame).not.toContain("<body>");
  });

  it("shows line-numbered changed rows for compact edits", async () => {
    const screen = await renderTui(createElement(ToolMessage, {
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
    expect(frame).toContain("Edit");
    expect(frame).toContain("demo.ts");
    expect(frame).not.toContain("completed edit:");
    expect(frame).toContain("old");
    expect(frame).toContain("new");
  });

  it("renders expanded edit harness output as a diff instead of the success sentence", async () => {
    const screen = await renderTui(createElement(ToolMessage, {
      toolName: "edit",
      toolArgs: JSON.stringify({ filePath: "test.txt" }),
      status: "completed",
      expanded: true,
      content: [
        "Successfully replaced the block in test.txt.",
        "--- test.txt",
        "+++ test.txt",
        "@@ -1,1 +1,1 @@",
        "-before block after",
        "+before updated after",
      ].join("\n"),
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("Edit");
    expect(frame).toContain("test.txt");
    expect(frame).toContain("before block after");
    expect(frame).toContain("before updated after");
    expect(frame).not.toContain("Successfully replaced the block");
  });

  it("renders expanded write output with highlighted added rows", async () => {
    const screen = await renderTui(createElement(ToolMessage, {
      toolName: "write",
      toolArgs: JSON.stringify({ filePath: "created.ts" }),
      status: "completed",
      expanded: true,
      content: [
        "Successfully wrote 25 characters to created.ts",
        "--- created.ts",
        "+++ created.ts",
        "@@ -1,0 +1,2 @@",
        "+export const name = \"new\";",
        "+export const ready = true;",
      ].join("\n"),
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("Write");
    expect(frame).toContain("created.ts");
    expect(frame).toContain("export const name = \"new\";");
    expect(frame).toContain("export const ready = true;");
    expect(frame).not.toContain("Successfully wrote");
  });

  it("renders overwrite write output without removed rows", async () => {
    const screen = await renderTui(createElement(ToolMessage, {
      toolName: "write",
      toolArgs: JSON.stringify({ filePath: "created.ts" }),
      status: "completed",
      expanded: true,
      content: [
        "Successfully wrote 24 characters to created.ts",
        "--- created.ts",
        "+++ created.ts",
        "@@ -1,1 +1,1 @@",
        "-export const name = \"old\";",
        "+export const name = \"new\";",
      ].join("\n"),
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("Write");
    expect(frame).toContain("created.ts");
    expect(frame).toContain("export const name = \"new\";");
    expect(frame).not.toContain("export const name = \"old\";");
  });

  it("shows capped diff with stats and expand hint when collapsed", async () => {
    const screen = await renderTui(createElement(ToolMessage, {
      toolName: "edit",
      toolArgs: JSON.stringify({ filePath: "demo.ts" }),
      status: "completed",
      expanded: false,
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
    expect(frame).toContain("Edit");
    expect(frame).toContain("demo.ts");
    expect(frame).toContain("+1 -1");
    expect(frame).toContain("(Ctrl+O to expand)");
    expect(frame).toContain("old");
    expect(frame).toContain("new");
  });
});
