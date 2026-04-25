import assert from "node:assert/strict";
import test from "node:test";

import { reflectAndSynthesize } from "../src/review/passes/reflection.js";

test("reflectAndSynthesize orders and deduplicates findings", async () => {
  const report = await reflectAndSynthesize({
    changedFiles: 2,
    mode: "ACT",
    model: null,
    provider: "heuristic",
    pullRequestTitle: "Add review pipeline",
    reviewedAt: "2026-04-25T00:00:00.000Z",
    sections: [
      {
        source: "security",
        title: "Security scan",
        summary: "Security findings detected.",
        findings: [
          {
            source: "security",
            severity: "high",
            title: "Possible hardcoded credential",
            detail: "A secret-looking value appears in code.",
            file: "src/auth.ts",
            line: 10,
          },
        ],
        notes: [],
      },
      {
        source: "lint",
        title: "Lint",
        summary: "Lint findings detected.",
        findings: [
          {
            source: "lint",
            severity: "low",
            title: "Console logging left in changed code",
            detail: "Consider removing debug logging before merging.",
            file: "src/foo.ts",
            line: 2,
          },
          {
            source: "lint",
            severity: "low",
            title: "Console logging left in changed code",
            detail: "Consider removing debug logging before merging.",
            file: "src/foo.ts",
            line: 2,
          },
        ],
        notes: [],
      },
    ],
  });

  assert.equal(report.findings.length, 2);
  assert.equal(report.findings[0]?.severity, "high");
  assert.match(report.summary, /Found 2 issue/);
  assert.match(report.rendered, /Possible hardcoded credential/);
});
