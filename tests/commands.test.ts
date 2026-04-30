import assert from "node:assert/strict";
import test from "node:test";

import { listPrsCommand } from "../src/app/commands/list-prs.js";
import { reviewCommand } from "../src/app/commands/review.js";
import { modeCommand } from "../src/app/commands/mode.js";

test("listPrsCommand parses /pr", () => {
  assert.deepEqual(listPrsCommand.parse("/pr"), {});
  assert.equal(listPrsCommand.parse("/review"), null);
});

test("reviewCommand parses /review and /review <number>", () => {
  assert.deepEqual(reviewCommand.parse("/review"), {});
  assert.deepEqual(reviewCommand.parse("/review 42"), { prNumber: 42 });
  assert.equal(reviewCommand.parse("/review abc"), null);
});

test("modeCommand parses /mode", () => {
  assert.deepEqual(modeCommand.parse("/mode PLAN"), { mode: "PLAN" });
  assert.deepEqual(modeCommand.parse("/mode ACT"), { mode: "ACT" });
  assert.equal(modeCommand.parse("/mode SOMETHING"), null);
});
