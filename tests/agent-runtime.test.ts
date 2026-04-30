import assert from "node:assert/strict";
import test from "node:test";

import { Agent } from "../src/core/agent.js";
import type { AgentProvider } from "../src/core/provider.js";
import type { RuntimeContext } from "../src/core/runtime.js";
import { noopLogger } from "../src/core/logger.js";
import { subagentReviewResultSchema, type SubagentReviewResult } from "../src/review/subagent.js";

function createRuntime(response: string | null): RuntimeContext {
  const calls: Array<{ systemPrompt: string; prompt: string; maxSteps?: number; tools?: string[] }> = [];
  return {
    config: {
      LLM_PROVIDER: "google",
      GEMINI_MODEL: "gemini-2.5-flash",
      ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
    },
    workspaceRoot: process.cwd(),
    memory: {
      addObservation: () => {},
      getMode: () => "ACT",
      getRecentObservations: () => [],
    } as any,
    logger: noopLogger,
    provider: response === null
      ? null
      : {
        provider: "google",
        label: "Google",
        model: "gemini-2.5-flash",
        aiModel: {} as any,
        calls,
        runTurn: async (args: Parameters<AgentProvider["runTurn"]>[0]) => {
          calls.push(args);
          return response;
        },
      } as any,
  };
}

const agent = new Agent<SubagentReviewResult>({
  name: "test-agent",
  role: "Tester",
  instructions: "Inspect files with tools.",
  tools: ["list_files", "read_file", "search_files"],
  outputSchema: subagentReviewResultSchema,
  maxSteps: 4,
});

test("Agent returns missing-provider when provider is required", async () => {
  const result = await agent.run({
    prompt: "Inspect src/foo.ts",
    runtime: createRuntime(null),
    mode: "ACT",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "missing-provider");
  }
});

test("Agent parses valid JSON through the configured schema", async () => {
  const runtime = createRuntime(JSON.stringify({
    summary: "ok",
    findings: [],
    notes: ["done"],
  }));
  const result = await agent.run({
    prompt: "Inspect src/foo.ts",
    runtime,
    mode: "ACT",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.summary, "ok");
  }
  const provider = runtime.provider as any;
  assert.match(provider.calls[0].prompt, /Available tools: list_files, read_file, search_files/);
  assert.equal(provider.calls[0].maxSteps, 4);
  assert.deepEqual(provider.calls[0].tools, ["list_files", "read_file", "search_files"]);
});

test("Agent reports invalid output", async () => {
  const result = await agent.run({
    prompt: "Inspect src/foo.ts",
    runtime: createRuntime("not json"),
    mode: "ACT",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid-output");
  }
});
