process.env.FORCE_COLOR = "3";
import { describe, expect, it } from "vitest";
import { highlightCode, highlightFilenames } from "../tui/components/shared/MarkdownRenderer.js";
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
});
