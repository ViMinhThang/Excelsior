process.env.FORCE_COLOR = "3";
import { describe, expect, it } from "vitest";
import { formatMarkdownTable, highlightCode, highlightFilenames, normalizePipeTables } from "../tui/components/shared/MarkdownRenderer.js";
import React from "react";

/** Utility to detect presence of standard ANSI escape codes in content string */
function hasAnsi(text: string): boolean {
  return /\u001b\[\d+m/.test(text);
}

describe("syntax highlighting logic", () => {
  it("highlights code blocks and generates output", () => {
    const node = highlightCode("const x = 123;", "ts") as any;
    expect(node).toBeDefined();
    expect(node.props.children).toBeDefined();
    
    const output = node.props.children;
    // Confirm output remains a robust string
    expect(typeof output).toBe("string");
    // Confirm it contains the core code content
    expect(output).toContain("const");
    expect(output).toContain("123");
  });

  it("successfully executes across distinct language types", () => {
    const pythonNode = highlightCode("def my_func():", "py") as any;
    const jsonNode = highlightCode('{"a": 1}', "json") as any;
    
    expect(typeof pythonNode.props.children).toBe("string");
    expect(typeof jsonNode.props.children).toBe("string");
    expect(pythonNode.props.children).toContain("def");
  });

  it("gracefully falls back on execution fail or empty parameters", () => {
    const emptyNode = highlightCode("plain text only", undefined) as any;
    expect(emptyNode).toBeDefined();
    // Should either highlight via auto-discovery or safely print raw text
    expect(emptyNode.props.children).toContain("plain text only");
  });

  it("highlights inline filename mentions inside paragraphs (Custom Implementation)", () => {
    // This helper didn't change, confirming existing logic remains operational
    const result = highlightFilenames("Check out useSettingValidator.ts and README.md.") as any;
    expect(result).toBeDefined();

    const fileSeg1 = result.find((s: any) => s.props.children === "useSettingValidator.ts");
    expect(fileSeg1).toBeDefined();
    expect(fileSeg1.props.color).toBe("#88c0d0");
    expect(fileSeg1.props.bold).toBe(true);

    const fileSeg2 = result.find((s: any) => s.props.children === "README.md");
    expect(fileSeg2).toBeDefined();
    expect(fileSeg2.props.color).toBe("#88c0d0");
    expect(fileSeg2.props.bold).toBe(true);

    const plainSeg = result.find((s: any) => s.props.children.includes("Check out "));
    expect(plainSeg).toBeDefined();
    expect(plainSeg.props.color).toBeUndefined();
  });

  it("truncates long markdown table cells while keeping row widths aligned", () => {
    const lines = formatMarkdownTable({
      headers: ["Tool", "Description"],
      rows: [["ripgrep", "x".repeat(80)]],
      maxCellWidth: 16,
    });

    expect(lines[0]).toMatch(/^┌─+┬─+┐$/);
    expect(lines[0]).toContain("┬");
    expect(lines[2]).toContain("┼");
    expect(lines.at(-1)).toContain("┴");
    expect(lines[3]).toContain("...");
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
  });

  it("normalizes pipe tables that do not start with a leading pipe", () => {
    const normalized = normalizePipeTables([
      "Tool | Type | Success | Notes",
      "-----|------|---------|------",
      "ls | File op | yes | table with sizes",
      "runCommand | Shell | no | date not found",
    ].join("\n"));

    expect(normalized).toContain("| Tool | Type | Success | Notes |");
    expect(normalized).toContain("| --- | --- | --- | --- |");
    expect(normalized).toContain("| runCommand | Shell | no | date not found |");
  });

  it("keeps prose around normalized pipe tables separated for marked parsing", () => {
    const normalized = normalizePipeTables([
      "Mixed content types",
      "Tool|Type|Success|Notes",
      "----|----|-------|-----",
      "glob|File op|yes|pattern * at root",
      "Done",
    ].join("\n"));

    expect(normalized).toContain("Mixed content types\n\n| Tool | Type | Success | Notes |");
    expect(normalized).toContain("| glob | File op | yes | pattern * at root |");
    expect(normalized).toContain("\n\nDone");
  });

  it("normalizes loose pipe tables that are missing separator rows", () => {
    const normalized = normalizePipeTables([
      "Tool|Type|Success|Notes",
      "ls|File op|yes|table with sizes",
      "runCommand|Shell|no|date not found",
    ].join("\n"));

    expect(normalized).toBe([
      "| Tool | Type | Success | Notes |",
      "| --- | --- | --- | --- |",
      "| ls | File op | yes | table with sizes |",
      "| runCommand | Shell | no | date not found |",
    ].join("\n"));
  });
});
