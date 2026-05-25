process.env.FORCE_COLOR = "3";
import { describe, expect, it } from "vitest";
import { formatMarkdownTable, highlightCode, highlightFilenames, normalizePipeTables } from "../src/components/shared/MarkdownRenderer.js";
import { getRawText, getTokenText } from "../src/lib/markdown/tables.js";
import React from "react";
import type { Token } from "marked";

/** Utility to detect presence of standard ANSI escape codes in content string */
function hasAnsi(text: string): boolean {
  return /\u001b\[\d+m/.test(text);
}

interface TextElementProps {
  children?: unknown;
  color?: string;
  bold?: boolean;
}

function getTextProps(node: React.ReactNode): TextElementProps {
  if (!React.isValidElement<TextElementProps>(node)) {
    throw new Error("Expected React text element");
  }
  return node.props;
}

describe("syntax highlighting logic", () => {
  it("highlights code blocks and generates output", () => {
    const node = highlightCode("const x = 123;", "ts");
    const props = getTextProps(node);
    expect(node).toBeDefined();
    expect(props.children).toBeDefined();
    
    const output = props.children;
    // Confirm output remains a robust string
    expect(typeof output).toBe("string");
    // Confirm it contains the core code content
    expect(output).toContain("const");
    expect(output).toContain("123");
    // Confirm ANSI color escape codes are generated
    expect(hasAnsi(output as string)).toBe(true);
  });

  it("successfully executes across distinct language types", () => {
    const pythonNode = getTextProps(highlightCode("def my_func():", "py"));
    const jsonNode = getTextProps(highlightCode('{"a": 1}', "json"));
    
    expect(typeof pythonNode.children).toBe("string");
    expect(typeof jsonNode.children).toBe("string");
    expect(pythonNode.children).toContain("def");
    
    // Confirm ANSI color escape codes are generated for multiple distinct languages
    expect(hasAnsi(pythonNode.children as string)).toBe(true);
    expect(hasAnsi(jsonNode.children as string)).toBe(true);
  });

  it("gracefully falls back on execution fail or empty parameters", () => {
    const emptyNode = getTextProps(highlightCode("plain text only", undefined));
    expect(emptyNode).toBeDefined();
    // Should either highlight via auto-discovery or safely print raw text
    const rawText = (emptyNode.children as string).replace(/\u001b\[[0-9;]*m/g, "");
    expect(rawText).toContain("plain text only");
  });

  it("renders inline filename mentions as normal text", () => {
    const result = highlightFilenames("Check out useSettingValidator.ts and README.md.");
    expect(result).toBeDefined();

    const props = getTextProps(result);
    expect(props.children).toBe("Check out useSettingValidator.ts and README.md.");
    expect(props.color).toBeUndefined();
    expect(props.bold).toBeUndefined();
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

  it("extracts raw markdown token text through typed fallbacks", () => {
    const tokens: Token[] = [
      { type: "strong", raw: "**bold**", text: "bold", tokens: [{ type: "text", raw: "bold", text: "bold" }] },
    ];

    expect(getRawText(tokens)).toBe("bold");
    expect(getTokenText({ type: "html", raw: "<br>", text: "<br>" })).toBe("<br>");
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
