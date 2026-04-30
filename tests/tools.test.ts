import assert from "node:assert/strict";
import test from "node:test";

import { getTools } from "../src/tools/index.js";

test("getTools filters tools by allowed names", () => {
  const tools = getTools(process.cwd(), ["read_file"]);

  assert.deepEqual(Object.keys(tools), ["read_file"]);
});

test("getTools returns all tools when no filter is provided", () => {
  const tools = getTools(process.cwd());

  assert.deepEqual(Object.keys(tools).sort(), ["list_files", "read_file", "search_files"]);
});
