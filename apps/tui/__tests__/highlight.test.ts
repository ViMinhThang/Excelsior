process.env.FORCE_COLOR = "3";
import { describe, expect, it } from "vitest";
import { highlightCode, highlightCodeLine, highlightFilenames } from "../src/lib/markdown/highlight.js";
import { formatMarkdownTable, normalizePipeTables } from "../src/lib/markdown/tables.js";
import { parseAnsiLine } from "../src/lib/markdown/ansiSpans.js";
import { getRawText, getTokenText } from "../src/lib/markdown/tables.js";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Token } from "marked";
import { MarkdownRenderer } from "../src/components/shared/MarkdownRenderer.js";

interface BoxElementProps {
  children?: React.ReactNode;
}

interface TextElementProps {
  children?: unknown;
  fg?: string;
  bg?: string;
  attributes?: number;
}

function getBoxChildren(node: React.ReactNode): React.ReactNode[] {
  if (!React.isValidElement<BoxElementProps>(node)) {
    throw new Error("Expected React box element");
  }
  return React.Children.toArray(node.props.children);
}

function flattenText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return "";
  }
  return React.Children.toArray(node.props.children)
    .map((child) => flattenText(child))
    .join("");
}

function findSpanByText(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAll((node) =>
    node.type === "span" && flattenText(node.props.children) === text
  )[0];
}

describe("syntax highlighting logic", () => {
  it("highlights code blocks with rose pine colors", () => {
    const node = highlightCode("const x = 123;", "ts");
    const lines = getBoxChildren(node);
    expect(lines).toHaveLength(1);

    const output = flattenText(lines[0]);
    expect(output).toContain("const");
    expect(output).toContain("123");

    const spans = parseAnsiLine("prefix \u001b[38;2;196;167;231mkeyword");
    expect(spans).toEqual([
      { text: "prefix ", bold: false, italic: false, underline: false },
      { text: "keyword", fg: "#c4a7e7", bold: false, italic: false, underline: false },
    ]);
  });

  it("renders each source line on its own row", () => {
    const node = highlightCode("const a = 1;\nconst b = 2;", "ts");
    const lines = getBoxChildren(node);
    expect(lines).toHaveLength(2);
    expect(flattenText(lines[0])).toContain("const a = 1;");
    expect(flattenText(lines[1])).toContain("const b = 2;");
  });

  it("successfully executes across distinct language types", () => {
    const pythonLines = getBoxChildren(highlightCode("def my_func():", "py"));
    const jsonLines = getBoxChildren(highlightCode('{"a": 1}', "json"));

    expect(flattenText(pythonLines[0])).toContain("def");
    expect(flattenText(jsonLines[0])).toContain('"a"');
  });

  it("renders highlighted inline code with a row background", () => {
    const line = highlightCodeLine("const x = 1;", "ts", {
      bg: "#111111",
      fallbackColor: "#eeeeee",
      keyPrefix: "diff_test",
    });
    const spans = React.Children.toArray(line);

    expect(spans.map((span) => flattenText(span)).join("")).toContain("const x = 1;");
    expect(spans.every((span) =>
      React.isValidElement<TextElementProps>(span) && span.props.bg === "#111111"
    )).toBe(true);
  });

  it("gracefully falls back on execution fail or empty parameters", () => {
    const lines = getBoxChildren(highlightCode("plain text only", undefined));
    expect(flattenText(lines[0])).toContain("plain text only");
  });

  it("renders inline filename mentions as normal text", () => {
    expect(highlightFilenames("Check out useSettingValidator.ts and README.md."))
      .toBe("Check out useSettingValidator.ts and README.md.");
  });

  it("uses separate muted highlight colors for bold and italic markdown text", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(MarkdownRenderer, {
        content: "**primary** and *secondary*",
        textColor: "#cccccc",
        emphasisColor: "#a89468",
        alternateEmphasisColor: "#8d8072",
      }));
    });

    expect(findSpanByText(renderer, "primary").props.fg).toBe("#a89468");
    expect(findSpanByText(renderer, "secondary").props.fg).toBe("#8d8072");
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
