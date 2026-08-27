import { describe, expect, it } from "vitest";
import { parseMarkdown, parseInline } from "../../src/components/markdown/MarkdownRenderer.js";

describe("Markdown parsing for Claude Code TUI", () => {
  it("parses code blocks with language tags", () => {
    const text = "```typescript\nconst greeting = 'hello';\n```";
    const blocks = parseMarkdown(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("code");
    expect(blocks[0].lang).toBe("typescript");
    expect(blocks[0].lines).toEqual(["const greeting = 'hello';"]);
  });

  it("parses headings and levels", () => {
    const text = "# Heading 1\n## Subheading";
    const blocks = parseMarkdown(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ kind: "heading", level: 1, lines: ["Heading 1"] });
    expect(blocks[1]).toEqual({ kind: "heading", level: 2, lines: ["Subheading"] });
  });

  it("parses ordered and bullet lists", () => {
    const bullet = "- item 1\n- item 2";
    const ordered = "1. first\n2. second";
    const bulletBlocks = parseMarkdown(bullet);
    const orderedBlocks = parseMarkdown(ordered);
    expect(bulletBlocks[0].kind).toBe("list");
    expect(bulletBlocks[0].ordered).toBe(false);
    expect(orderedBlocks[0].kind).toBe("list");
    expect(orderedBlocks[0].ordered).toBe(true);
  });

  it("parses blockquotes and horizontal rules", () => {
    const text = "> quoted message\n\n---";
    const blocks = parseMarkdown(text);
    expect(blocks[0]).toEqual({ kind: "quote", lines: ["quoted message"] });
    expect(blocks[1]).toEqual({ kind: "empty", lines: [] });
    expect(blocks[2]).toEqual({ kind: "hr", lines: [] });
  });

  it("parses inline tokens for bold, italic, and inline code", () => {
    const tokens = parseInline("Hello **world** with `code` and *emphasis*");
    expect(tokens).toEqual([
      { text: "Hello " },
      { text: "world", bold: true },
      { text: " with " },
      { text: "code", code: true },
      { text: " and " },
      { text: "emphasis", italic: true },
    ]);
  });
});
