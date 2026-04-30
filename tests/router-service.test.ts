import assert from "node:assert/strict";
import test from "node:test";

import { routePrompt } from "../src/services/router-service.js";

const config = {
  LLM_PROVIDER: "google" as const,
  GEMINI_MODEL: "gemini-2.5-flash",
  ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
};

test("routePrompt detects review requests without an LLM provider", async () => {
  assert.deepEqual(await routePrompt("please review PR 123", config), {
    intent: "REVIEW",
    prNumber: 123,
  });

  assert.deepEqual(await routePrompt("review the pull request", config), {
    intent: "REVIEW",
  });
});

test("routePrompt falls back to chat without an LLM provider", async () => {
  assert.deepEqual(await routePrompt("what can you do?", config), {
    intent: "CHAT",
  });
});
