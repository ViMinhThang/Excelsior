import { describe, expect, it } from "vitest";
import {
  parseInlineMarkdown,
  parseMarkdown,
} from "../src/renderer/components/markdownMessage/markdownModel.js";

describe("desktop markdown model", () => {
  it("splits fenced code blocks from prose", () => {
    expect(parseMarkdown("Before\n```ts\nconst x = 1;\n```\nAfter")).toEqual([
      { type: "text", content: "Before\n" },
      { type: "code", language: "ts", content: "const x = 1;" },
      { type: "text", content: "\nAfter" },
    ]);
  });

  it("tokenizes strong and inline code spans", () => {
    expect(parseInlineMarkdown("Use **bold** and `code`.")).toEqual([
      { type: "text", content: "Use " },
      { type: "strong", content: "bold" },
      { type: "text", content: " and " },
      { type: "code", content: "code" },
      { type: "text", content: "." },
    ]);
  });
});
