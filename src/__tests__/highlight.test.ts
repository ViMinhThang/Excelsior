import { describe, expect, it } from "vitest";
import { highlightCode, highlightFilenames } from "../tui/components/shared/MarkdownRenderer.js";
import React from "react";

describe("syntax highlighting logic", () => {
  it("highlights JS/TS keywords correctly with word-boundary safety", () => {
    const node = highlightCode("const toString = 123;\nclass className {}", "ts") as any;
    expect(node).toBeDefined();

    const lines = node.props.children;
    expect(lines.length).toBe(2);

    // Line 0: const toString = 123;
    const segments0 = lines[0].props.children.props.children;
    
    // "const" should be highlighted as a keyword
    const constSeg = segments0.find((s: any) => s.props.children === "const");
    expect(constSeg).toBeDefined();
    expect(constSeg.props.color).toBe("#81a1c1");
    expect(constSeg.props.bold).toBe(true);

    // "toString" should not be highlighted as a keyword (even though it contains "string")
    const toStringSeg = segments0.find((s: any) => s.props.children.includes("toString"));
    expect(toStringSeg).toBeDefined();
    expect(toStringSeg.props.color).not.toBe("#81a1c1");
  });

  it("ensures numbers inside string literals are safe from number highlighting", () => {
    const node = highlightCode('const x = "string containing 123";', "ts") as any;
    const segments = node.props.children[0].props.children.props.children;

    // The entire '"string containing 123"' should be a single string segment (colored green #a3be8c)
    const strSeg = segments.find((s: any) => s.props.children === '"string containing 123"');
    expect(strSeg).toBeDefined();
    expect(strSeg.props.color).toBe("#a3be8c");

    // "123" should not be separated out as a number segment
    const numSeg = segments.find((s: any) => s.props.children === "123");
    expect(numSeg).toBeUndefined();
  });

  it("verifies JSON values containing // are safe from false positive comments", () => {
    const node = highlightCode('{\n  "url": "https://example.com"\n}', "json") as any;
    const lines = node.props.children;

    // Line 1 should be: "url": "https://example.com"
    const segments1 = lines[1].props.children.props.children;

    // Double quotes and colons are separated
    const urlValueSeg = segments1.find((s: any) => s.props.children === '"https://example.com"');
    expect(urlValueSeg).toBeDefined();
    expect(urlValueSeg.props.color).toBe("#a3be8c"); // Green string, not a grey comment
  });

  it("verifies language-specific keywords match correctly", () => {
    // "def" is a keyword in Python, but raw in TS
    const pyNode = highlightCode("def my_func():", "py") as any;
    const tsNode = highlightCode("def my_func():", "ts") as any;

    const pySegs = pyNode.props.children[0].props.children.props.children;
    const tsSegs = tsNode.props.children[0].props.children.props.children;

    const pyDef = pySegs.find((s: any) => s.props.children === "def");
    expect(pyDef).toBeDefined();
    expect(pyDef.props.color).toBe("#81a1c1");

    const tsDef = tsSegs.find((s: any) => s.props.children.includes("def"));
    expect(tsDef).toBeDefined();
    expect(tsDef.props.color).not.toBe("#81a1c1");
  });

  it("highlights function calls and types in code blocks", () => {
    const node = highlightCode("useState(123);\nclass MyClass {}", "ts") as any;
    const lines = node.props.children;

    // Line 0: useState(123);
    const segments0 = lines[0].props.children.props.children;
    const useStateSeg = segments0.find((s: any) => s.props.children === "useState");
    expect(useStateSeg).toBeDefined();
    expect(useStateSeg.props.color).toBe("#8fbcbb");

    // Line 1: class MyClass {}
    const segments1 = lines[1].props.children.props.children;
    const myClassSeg = segments1.find((s: any) => s.props.children === "MyClass");
    expect(myClassSeg).toBeDefined();
    expect(myClassSeg.props.color).toBe("#8fbcbb");
  });

  it("highlights function declarations and call invocations in yellow", () => {
    const node = highlightCode("validate();", "ts") as any;
    const segments = node.props.children[0].props.children.props.children;
    const validateSeg = segments.find((s: any) => s.props.children === "validate");
    expect(validateSeg).toBeDefined();
    expect(validateSeg.props.color).toBe("#ebcb8b");
  });

  it("highlights inline filename mentions inside paragraphs", () => {
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
