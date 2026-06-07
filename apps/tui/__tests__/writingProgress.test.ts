import { describe, expect, it } from "vitest";
import { estimateWriteProgressStats } from "../src/lib/toolMessage/progress.js";

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
});