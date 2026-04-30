import assert from "node:assert/strict";
import test from "node:test";

import { routePrompt } from "../src/services/router-service.js";

const config = {
  LLM_PROVIDER: "google" as const,
  GEMINI_MODEL: "gemini-2.5-flash",
  ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
  DEEPSEEK_MODEL: "deepseek-v4-flash",
};

test("routePrompt detects review requests without an LLM provider", async () => {
  const mockMemory = { workspaceRoot: "." } as any;
  assert.deepEqual(await routePrompt("please review PR 123", config, ".", mockMemory), {
    intent: "REVIEW",
    prNumber: 123,
  });

  assert.deepEqual(await routePrompt("review the pull request", config, ".", mockMemory), {
    intent: "REVIEW",
  });
});

test("routePrompt falls back to chat without an LLM provider", async () => {
  const mockMemory = { workspaceRoot: "." } as any;
  assert.deepEqual(await routePrompt("what can you do?", config, ".", mockMemory), {
    intent: "CHAT",
  });
});
