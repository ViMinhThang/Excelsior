import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownMessage } from "../src/renderer/components/MarkdownMessage.js";

describe("desktop markdown message", () => {
  it("renders streaming assistant content as plain text", () => {
    const html = renderToStaticMarkup(createElement(MarkdownMessage, {
      block: { content: "Use **bold** and `code`.\n```ts\nconst x = 1;\n```" },
    }));

    expect(html).toContain("Use **bold** and `code`.");
    expect(html).toContain("```ts");
    expect(html).not.toContain("<strong");
    expect(html).not.toContain("code-block-header");
  });

  it("renders finalized assistant content as markdown", () => {
    const html = renderToStaticMarkup(createElement(MarkdownMessage, {
      block: { content: "Use **bold** and `code`.", isFrozen: true },
    }));

    expect(html).toContain("<strong");
    expect(html).toContain("<code");
  });
});
