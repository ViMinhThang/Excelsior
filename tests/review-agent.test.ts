import assert from "node:assert/strict";
import test from "node:test";

import { noopLogger } from "../src/core/logger.js";
import type { RuntimeContext } from "../src/core/runtime.js";
import { reviewAgent } from "../src/review/review-agent.js";

function createRuntime(responses: Record<string, string>): RuntimeContext {
  const calls: Array<{ systemPrompt: string; prompt: string }> = [];
  return {
    config: {
      LLM_PROVIDER: "google",
      GEMINI_MODEL: "gemini-2.5-flash",
      ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
      DEEPSEEK_MODEL: "deepseek-v4-flash",
    },
    workspaceRoot: process.cwd(),
    memory: {
      addObservation: () => {},
      getMode: () => "ACT",
      getRecentObservations: () => [],
    } as any,
    logger: noopLogger,
    provider: {
      provider: "google",
      label: "Google",
      model: "gemini-2.5-flash",
      runTurn: async (input: any) => {
        calls.push(input);
        const agentNameMatch = input.systemPrompt.match(/Agent: (.+)/);
        const agentName = agentNameMatch ? agentNameMatch[1].trim() : "unknown";
        return responses[agentName] || JSON.stringify({});
      },
    } as any,
  };
}

test("reviewAgent has 3 subagents and a synthesizer", () => {
  assert.equal(reviewAgent.subagents?.length, 3);
  assert.ok(reviewAgent.synthesizer);
  assert.equal(reviewAgent.subagents?.[0]?.agent.name, "code-reviewer");
  assert.equal(reviewAgent.subagents?.[1]?.agent.name, "lint-reviewer");
  assert.equal(reviewAgent.subagents?.[2]?.agent.name, "security-reviewer");
  assert.equal(reviewAgent.synthesizer?.name, "reflection-synthesizer");
});

test("reviewAgent executes end-to-end review and synthesis", async () => {
  const responses = {
    "code-reviewer": JSON.stringify({
      summary: "code-ok",
      findings: [{ source: "code-review", severity: "low", title: "CR", detail: "D" }],
      notes: []
    }),
    "lint-reviewer": JSON.stringify({
      summary: "lint-ok",
      findings: [{ source: "lint", severity: "medium", title: "L", detail: "D" }],
      notes: []
    }),
    "security-reviewer": JSON.stringify({
      summary: "sec-ok",
      findings: [],
      notes: []
    }),
    "reflection-synthesizer": JSON.stringify({
      summary: "Summary narrative",
      overview: "Overview narrative",
      sections: [
        { source: "code-review", title: "CR", summary: "sum", findings: [], notes: [] },
        { source: "lint", title: "L", summary: "sum", findings: [], notes: [] },
        { source: "security", title: "S", summary: "sum", findings: [], notes: [] }
      ],
      findings: [
        { source: "lint", severity: "medium", title: "L", detail: "D" },
        { source: "code-review", severity: "low", title: "CR", detail: "D" }
      ]
    })
  };

  const runtime = createRuntime(responses);
  const result = await reviewAgent.run({
    prompt: "Test PR diff",
    runtime,
    mode: "ACT"
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const value = result.value as any;
    assert.equal(value.summary, "Summary narrative");
    assert.equal(value.findings.length, 2);
    assert.equal(value.findings[0].severity, "medium"); // Sorted by synth agent
  }
});
