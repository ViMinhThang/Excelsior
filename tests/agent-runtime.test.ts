import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { Agent } from "../src/core/agent.js";
import type { AgentProvider } from "../src/core/provider.js";
import type { RuntimeContext } from "../src/core/runtime.js";
import { noopLogger } from "../src/core/logger.js";
import {
  subagentResultSchema,
  type SubagentReviewResult,
} from "../src/review/review-agent.js";

function createRuntime(response: string | null): RuntimeContext {
  const calls: any[] = [];
  return {
    config: {
      LLM_PROVIDER: "google",
      GEMINI_MODEL: "gemini-2.5-flash",
      ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
      DEEPSEEK_MODEL: "deepseek-v4-flash",
      OPENROUTER_MODEL: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    },
    workspaceRoot: process.cwd(),
    memory: {
      addObservation: () => {},
      getMode: () => "ACT",
      getRecentObservations: () => [],
    } as any,
    logger: noopLogger,
    provider:
      response === null
        ? null
        : ({
            provider: "google",
            label: "Google",
            model: "gemini-2.5-flash",
            calls,
            runTurn: async (args: {
              systemPrompt: string;
              prompt: string;
              cwd?: string;
              maxSteps?: number | undefined;
              tools?: string[] | undefined;
              signal?: AbortSignal | undefined;
            }) => {
              calls.push(args);
              return response;
            },
          } as any),
  };
}

const agent = new Agent<SubagentReviewResult>({
  name: "test-agent",
  role: "Tester",
  instructions: "Inspect files with tools.",
  tools: ["list_files", "read_file", "search_files"],
  outputSchema: subagentResultSchema,
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
  const runtime = createRuntime(
    JSON.stringify({
      summary: "ok",
      findings: [],
      notes: ["done"],
    }),
  );
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
  assert.match(
    provider.calls[0].prompt,
    /Available tools: list_files, read_file, search_files/,
  );
  assert.equal(provider.calls[0].maxSteps, 4);
  assert.deepEqual(provider.calls[0].tools, [
    "list_files",
    "read_file",
    "search_files",
  ]);
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

test("Parent agent dispatches to subagents in parallel", async () => {
  const child1 = new Agent({
    name: "child1",
    role: "Child 1",
    instructions: "Do part 1",
    tools: [],
    outputSchema: z.object({ res: z.string() }),
  });
  const child2 = new Agent({
    name: "child2",
    role: "Child 2",
    instructions: "Do part 2",
    tools: [],
    outputSchema: z.object({ res: z.string() }),
  });

  const parent = new Agent({
    name: "parent",
    role: "Parent",
    instructions: "Coordinate",
    tools: [],
    outputSchema: z.array(z.any()),
    subagents: [{ agent: child1 }, { agent: child2 }],
  });

  const runtime = createRuntime(JSON.stringify({ res: "ok" }));
  const result = await parent.run({
    prompt: "Test prompt",
    runtime,
    mode: "ACT",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const value = result.value as any[];
    assert.equal(Array.isArray(value), true);
    assert.equal(value.length, 2);
    assert.equal(value[0].agentName, "child1");
    assert.equal(value[1].agentName, "child2");
  }
});

test("Parent with synthesizer merges subagent results", async () => {
  const child = new Agent({
    name: "child",
    role: "Child",
    instructions: "Do something",
    tools: [],
    outputSchema: z.object({ data: z.string() }),
  });

  const synthesizer = new Agent({
    name: "synthesizer",
    role: "Synthesizer",
    instructions: "Merge results",
    tools: [],
    outputSchema: z.object({ final: z.string() }),
  });

  const parent = new Agent({
    name: "parent",
    role: "Parent",
    instructions: "Coordinate",
    tools: [],
    outputSchema: z.object({ final: z.string() }),
    subagents: [{ agent: child }],
    synthesizer,
  });

  const calls: any[] = [];
  const runtime: RuntimeContext = {
    ...createRuntime(""),
    provider: {
      provider: "google",
      label: "Google",
      model: "gemini-2.5-flash",
      runTurn: async (args: any) => {
        calls.push(args);
        // First call is child, second is synthesizer
        if (calls.length === 1) return JSON.stringify({ data: "child-data" });
        return JSON.stringify({ final: "merged-data" });
      },
    } as any,
  };

  const result = await parent.run({
    prompt: "Start",
    runtime,
    mode: "ACT",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const value = result.value as { final: string };
    assert.equal(value.final, "merged-data");
  }
  assert.equal(calls.length, 2);
  assert.match(calls[1].prompt, /child-data/);
});

test("Required subagent failure aborts siblings", async () => {
  const failingChild = new Agent({
    name: "failing",
    role: "Failer",
    instructions: "Always fail",
    tools: [],
    outputSchema: z.object({}),
  });
  const otherChild = new Agent({
    name: "other",
    role: "Other",
    instructions: "Wait and see",
    tools: [],
    outputSchema: z.object({}),
  });

  const parent = new Agent({
    name: "parent",
    role: "Parent",
    instructions: "Coordinate",
    tools: [],
    outputSchema: z.array(z.any()),
    subagents: [{ agent: failingChild, required: true }, { agent: otherChild }],
  });

  const runtime: RuntimeContext = {
    ...createRuntime(""),
    provider: {
      provider: "google",
      label: "Google",
      model: "gemini-2.5-flash",
      runTurn: async (args: any) => {
        if (args.systemPrompt.includes("failing")) {
          throw new Error("subagent-boom");
        }
        // Give time for failing child to fail and trigger abort
        await new Promise((resolve) => setTimeout(resolve, 50));
        return JSON.stringify({});
      },
    } as any,
  };

  const result = await parent.run({
    prompt: "Start",
    runtime,
    mode: "ACT",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /Subagent 'failing' failed: .*subagent-boom/);
  }
});
