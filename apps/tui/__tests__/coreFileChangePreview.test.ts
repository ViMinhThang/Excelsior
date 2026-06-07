import { describe, expect, it } from "vitest";
import {
  buildFileChangePreviewFrame,
  buildUnifiedFileDiff,
  getFileChangePreviewNavigation,
  parseFileChangePreview,
  parsePendingFileChangePreview,
} from "@excelsior/core";

describe("file change preview parser", () => {
  it("builds unified diffs for created and overwritten writes", () => {
    const created = buildUnifiedFileDiff("created.ts", "", "export const x = 1;");
    expect(created).toContain("@@ -1,0 +1,1 @@");
    expect(created).toContain("+export const x = 1;");

    const overwritten = buildUnifiedFileDiff(
      "created.ts",
      "export const x = 1;",
      "export const x = 2;",
    );
    expect(overwritten).toContain("-export const x = 1;");
    expect(overwritten).toContain("+export const x = 2;");
    expect(buildUnifiedFileDiff("same.ts", "same", "same")).toBeUndefined();
  });

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

  it("builds capped unified preview frames", () => {
    const lines = Array.from({ length: 12 }, (_, index) => [
      `-old ${index}`,
      `+new ${index}`,
    ]).flat();
    const preview = parseFileChangePreview({
      toolName: "edit",
      filePath: "many.ts",
      content: [
        "Successfully replaced the block in many.ts.",
        "--- many.ts",
        "+++ many.ts",
        "@@ -1,12 +1,12 @@",
        ...lines,
      ].join("\n"),
    });

    expect(preview).toBeTruthy();
    const frame = buildFileChangePreviewFrame({
      preview: preview!,
      terminalColumns: 100,
    });

    expect(frame.inlineRows).toHaveLength(10);
    expect(frame.isCapped).toBe(true);
    expect(frame.previewWidth).toBe(100);
  });

  it("can build write-style frames without removed rows", () => {
    const preview = parseFileChangePreview({
      toolName: "write",
      filePath: "created.ts",
      content: [
        "Successfully wrote 24 characters to created.ts",
        "--- created.ts",
        "+++ created.ts",
        "@@ -1,2 +1,2 @@",
        "-export const oldName = \"old\";",
        "-export const oldReady = false;",
        "+export const name = \"new\";",
        "+export const ready = true;",
      ].join("\n"),
    });

    expect(preview).toBeTruthy();
    const frame = buildFileChangePreviewFrame({
      preview: preview!,
      terminalColumns: 100,
      hideRemovedRows: true,
    });

    expect(frame.inlineRows).toMatchObject([
      { tone: "added", text: "export const name = \"new\";" },
      { tone: "added", text: "export const ready = true;" },
    ]);
  });

  it("keeps pending viewport and hunk navigation behind the preview module", () => {
    const preview = parsePendingFileChangePreview({
      toolName: "editFile",
      filePath: "multi.ts",
      diff: [
        "--- multi.ts",
        "+++ multi.ts",
        "@@ -1,1 +1,1 @@",
        "-old one",
        "+new one",
        "@@ -20,1 +20,1 @@",
        "-old two",
        "+new two",
      ].join("\n"),
    });

    expect(preview).toBeTruthy();
    expect(getFileChangePreviewNavigation(preview)).toMatchObject({
      hunkCount: 2,
      hunkIndices: [0, 1],
    });

    const frame = buildFileChangePreviewFrame({
      preview: preview!,
      terminalColumns: 180,
      pending: true,
      scrollOffset: 1,
    });

    expect(frame.inlineRows.length).toBeLessThanOrEqual(12);
    expect(frame.inlineRows.some((row) => row.tone === "removed")).toBe(true);
    expect(frame.inlineRows.some((row) => row.tone === "added")).toBe(true);
    expect(frame.showScrollbar).toBe(false);
  });
});
