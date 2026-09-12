const test = require("node:test");
const assert = require("node:assert/strict");
require("./load-typescript.cjs");
const { parseMarkdownBlocks } = require("../lib/markdown.ts");

test("table: escaped pipes stay in cells, empty cells keep alignment", () => {
  const blocks = parseMarkdownBlocks("| a | b \\| c | |\n|---|---|---|\n| x \\| y | | z |");
  const table = blocks.find((b) => b.type === "table");
  assert.deepEqual(table.headers, ["a", "b | c", ""]);
  assert.deepEqual(table.rows[0], ["x | y", "", "z"]);
});

test("heading: ATX closing hashes stripped", () => {
  const blocks = parseMarkdownBlocks("## Title ##");
  assert.equal(blocks[0].type, "h");
  assert.equal(blocks[0].text, "Title");
});

test("lists: 2-space and 4-space indents nest one level each", () => {
  const two = parseMarkdownBlocks("- a\n  - b");
  const four = parseMarkdownBlocks("- a\n    - b");
  assert.equal(two[0].items[1].level, 1);
  assert.equal(four[0].items[1].level, 1);
});

test("quote: multiple lines preserved", () => {
  const blocks = parseMarkdownBlocks("> line one\n> line two");
  assert.equal(blocks[0].type, "quote");
  assert.equal(blocks[0].content, "line one\nline two");
});
