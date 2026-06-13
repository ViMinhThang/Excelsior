import { describe, expect, it } from "vitest";
import { buildWritingProgressLines, estimateWriteProgressStats } from "@excelsior/core";

describe("estimateWriteProgressStats", () => {
  it("counts streamed write content lines as added lines", () => {
    const partialArgs = [
      "{\"filePath\":\"report.html\",\"content\":\"<html>",
      "\\n<body>",
      "\\n<h1>Report",
    ].join("");

    expect(estimateWriteProgressStats(partialArgs)).toEqual({
      added: 3,
      removed: 0,
    });
  });

  it("returns zero stats before content arrives", () => {
    expect(estimateWriteProgressStats("{\"filePath\":\"report.html\"")).toEqual({
      added: 0,
      removed: 0,
    });
  });

  it("decodes streamed JSON string escapes without requiring closed JSON", () => {
    const partialArgs = [
      "{\"filePath\":\"report.html\",\"content\":\"line 1",
      "\\nquoted: \\\"value\\\"",
      "\\ncheck: \\u2713",
    ].join("");

    expect(estimateWriteProgressStats(partialArgs)).toEqual({
      added: 3,
      removed: 0,
    });
    expect(buildWritingProgressLines(partialArgs)).toContain("check: ✓");
  });

  it("waits for the requested key instead of reading earlier string values", () => {
    const partialArgs = "{\"filePath\":\"report.html\",\"content\":\"actual";

    expect(buildWritingProgressLines(partialArgs)).toContain("target: report.html");
    expect(buildWritingProgressLines(partialArgs)).toContain("actual");
  });
});
