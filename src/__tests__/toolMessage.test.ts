import { createElement } from "react";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import ToolMessage, { formatCliCommand } from "../../apps/tui/src/components/chat/ToolMessage.js";

describe("ToolMessage command formatting", () => {
  it("shows view calls with only the final path segment", () => {
    expect(formatCliCommand(
      "view",
      JSON.stringify({
        filePath: ["packages", "run-runtime", "src", "runOrchestrator.ts"].join("/"),
      }),
    )).toBe("view runOrchestrator.ts");
  });

  it("does not show quoted JSON args for view calls", () => {
    expect(formatCliCommand(
      "view",
      JSON.stringify({
        filePath: ["packages", "agent-host", "src", "host", "LocalAgentHost.ts"].join("/"),
      }),
    )).toBe("view LocalAgentHost.ts");
  });

  it("shows ls calls with the directory path value only", () => {
    const directoryPath = ["packages", "agent-host", "src", "application"].join("/");

    expect(formatCliCommand(
      "ls",
      JSON.stringify({ directoryPath }),
    )).toBe(`ls ${directoryPath}`);
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
    expect(frame).toContain("edit demo.ts (+1 -1)");
    expect(frame).toContain("old");
    expect(frame).toContain("new");
    expect(frame).toContain("  2 -  const state = \"old\";");
    expect(frame).toContain("  2 +  const state = \"new\";");
  });

  it("shows edit panes by default without the collapsed summary", () => {
    const screen = render(createElement(ToolMessage, {
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
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("edit demo.ts (+1 -1)");
    expect(frame).toContain("old");
    expect(frame).toContain("new");
    expect(frame).not.toContain("(+1 -1 lines)");
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
    expect(frame).toContain("  1 - const previousValue =");
    expect(frame).toContain("visible\";");
    expect(frame).toContain("  1 + const nextValue = \"this");
    expect(frame).toContain("should also");
    expect(frame).toContain("remain visible\";");
    expect(frame).not.toContain("...");
  });
});
