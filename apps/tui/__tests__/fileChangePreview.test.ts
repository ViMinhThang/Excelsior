import { describe, expect, it } from "vitest";
import { parseFileChangePreview } from "../src/lib/fileChangePreview.js";

describe("file change preview parser", () => {
  it("parses completed edit output into aligned old and new panes", () => {
    const preview = parseFileChangePreview({
      toolName: "edit",
      filePath: "demo.ts",
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
    });

    expect(preview).toMatchObject({
      filePath: "demo.ts",
      action: "edit",
      oldTitle: "old",
      newTitle: "new",
      added: 1,
      removed: 1,
      omittedRows: 0,
    });
    expect(preview?.oldLines).toEqual([
      "const label = \"demo\";",
      "const state = \"old\";",
      "export { state };",
    ]);
    expect(preview?.newLines).toEqual([
      "const label = \"demo\";",
      "const state = \"new\";",
      "export { state };",
    ]);
    expect(preview?.oldRows).toMatchObject([
      { marker: " ", tone: "context", lineNumber: 1 },
      { marker: "-", tone: "removed", text: "const state = \"old\";", lineNumber: 2 },
      { marker: " ", tone: "context", lineNumber: 3 },
    ]);
    expect(preview?.newRows).toMatchObject([
      { marker: " ", tone: "context", lineNumber: 1 },
      { marker: "+", tone: "added", text: "const state = \"new\";", lineNumber: 2 },
      { marker: " ", tone: "context", lineNumber: 3 },
    ]);
  });

  it("parses created files with an empty old pane", () => {
    const preview = parseFileChangePreview({
      toolName: "write",
      filePath: "created.ts",
      content: [
        "Successfully wrote 25 characters to created.ts",
        "--- created.ts",
        "+++ created.ts",
        "@@ -1,0 +1,2 @@",
        "+export const name = \"new\";",
        "+export const ready = true;",
      ].join("\n"),
    });

    expect(preview).toMatchObject({
      filePath: "created.ts",
      action: "create",
      added: 2,
      removed: 0,
    });
    expect(preview?.oldLines).toEqual(["", ""]);
    expect(preview?.newLines).toEqual([
      "export const name = \"new\";",
      "export const ready = true;",
    ]);
    expect(preview?.oldRows).toMatchObject([
      { marker: " ", tone: "empty" },
      { marker: " ", tone: "empty" },
    ]);
    expect(preview?.newRows).toMatchObject([
      { marker: "+", tone: "added", lineNumber: 1 },
      { marker: "+", tone: "added", lineNumber: 2 },
    ]);
  });
});
