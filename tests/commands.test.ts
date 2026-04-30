import assert from "node:assert/strict";
import test from "node:test";

import { formatHelpText, parseCommand } from "../src/app/commands.js";

test("parseCommand recognizes pull request list and direct review flows", () => {
  assert.deepEqual(parseCommand("/pr"), { type: "list-prs" });
  assert.deepEqual(parseCommand("/review"), { type: "review-pr" });
  assert.deepEqual(parseCommand("/review 42"), { type: "review-pr", prNumber: 42 });
});

test("parseCommand rejects malformed review numbers", () => {
  assert.deepEqual(parseCommand("/review abc"), { type: "unknown", raw: "/review abc" });
});

test("formatHelpText lists the supported commands", () => {
  const help = formatHelpText();
  assert.match(help, /\/pr/);
  assert.match(help, /\/review <number>/);
  assert.match(help, /\/settings/);
});
