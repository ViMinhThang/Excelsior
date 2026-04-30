import assert from "node:assert/strict";
import test from "node:test";

import { extractChangedFiles } from "../src/review/diff.js";

const SAMPLE_DIFF = [
  "diff --git a/src/foo.ts b/src/foo.ts",
  "index 1111111..2222222 100644",
  "--- a/src/foo.ts",
  "+++ b/src/foo.ts",
  "@@ -1,2 +1,4 @@",
  " export const value = 1;",
  "+console.log('debug');",
  "+const todo = 'TODO';",
  "diff --git a/tests/foo.test.ts b/tests/foo.test.ts",
  "index 3333333..4444444 100644",
  "--- a/tests/foo.test.ts",
  "+++ b/tests/foo.test.ts",
  "@@ -0,0 +1,2 @@",
  "+test('value', () => {",
  "+});",
].join("\n");

test("extractChangedFiles parses file paths and added line numbers", () => {
  const files = extractChangedFiles(SAMPLE_DIFF);

  assert.equal(files.length, 2);
  assert.equal(files[0]?.path, "src/foo.ts");
  assert.equal(files[0]?.addedLines[0]?.number, 2);
  assert.equal(files[0]?.addedLines[1]?.number, 3);
  assert.equal(files[1]?.path, "tests/foo.test.ts");
  assert.equal(files[1]?.addedLines[0]?.number, 1);
});
