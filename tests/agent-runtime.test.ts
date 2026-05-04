import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { Agent } from "../src/core/agent/agent.js";
import { AgentRegistry } from "../src/core/agent/registry.js";
import { plannerOutputSchema, type PlannerOutput } from "../src/core/agent/dynamic.js";
import type { AgentProvider } from "../src/core/llm/provider.js";
import type { RuntimeContext } from "../src/core/runtime.js";
import { noopLogger } from "../src/core/logger.js";
import {
  subagentResultSchema,
  type SubagentReviewResult,
} from "../src/review/schemas.js";

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

test("Parent agent dispatches to subagents via planner", async () => {
  const child1 = new Agent({
    name: "test-child1",
    role: "Child 1",
    instructions: "Do part 1",
    tools: [],
    outputSchema: z.object({ res: z.string() }),
  });
  const child2 = new Agent({
    name: "test-child2",
    role: "Child 2",
    instructions: "Do part 2",
    tools: [],
    outputSchema: z.object({ res: z.string() }),
  });

  AgentRegistry.register("test-child1", child1);
  AgentRegistry.register("test-child2", child2);

  const planner = new Agent<PlannerOutput>({
    name: "test-planner",
    role: "Planner",
    instructions: "Plan subagents",
    tools: [],
    outputSchema: plannerOutputSchema,
    maxSteps: 1,
  });

  const parent = new Agent({
    name: "parent",
    role: "Parent",
    instructions: "Coordinate",
    tools: [],
    outputSchema: z.array(z.any()),
    planner,
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
        // First call is planner
        if (calls.length === 1) {
          return JSON.stringify({
            plan: "use both children",
            subagents: [
              { name: "test-child1", prompt: "Do part 1" },
              { name: "test-child2", prompt: "Do part 2" },
            ],
          });
        }
        // Subsequent calls are child subagents
        return JSON.stringify({ res: "ok" });
      },
    } as any,
  };

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
    assert.equal(value[0].agentName, "test-child1");
    assert.equal(value[1].agentName, "test-child2");
  }

  AgentRegistry.clear();
});

test("Parent with synthesizer merges subagent results", async () => {
  const child = new Agent({
    name: "synth-child",
    role: "Child",
    instructions: "Do something",
    tools: [],
    outputSchema: z.object({ data: z.string() }),
  });

  AgentRegistry.register("synth-child", child);

  const planner = new Agent<PlannerOutput>({
    name: "synth-planner",
    role: "Planner",
    instructions: "Plan",
    tools: [],
    outputSchema: plannerOutputSchema,
    maxSteps: 1,
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
    planner,
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
        // First call: planner
        if (calls.length === 1) {
          return JSON.stringify({
            plan: "use child",
            subagents: [{ name: "synth-child", prompt: "Do it" }],
          });
        }
        // Second call: child subagent
        if (calls.length === 2) {
          return JSON.stringify({ data: "child-data" });
        }
        // Third call: synthesizer
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
  assert.equal(calls.length, 3);
  assert.match(calls[2].prompt, /child-data/);

  AgentRegistry.clear();
});

test("Subagent failure produces error outcome", async () => {
  const failingChild = new Agent({
    name: "failing-child",
    role: "Failer",
    instructions: "Always fail",
    tools: [],
    outputSchema: z.object({}),
  });
  const otherChild = new Agent({
    name: "other-child",
    role: "Other",
    instructions: "Succeed",
    tools: [],
    outputSchema: z.object({}),
  });

  AgentRegistry.register("failing-child", failingChild);
  AgentRegistry.register("other-child", otherChild);

  const planner = new Agent<PlannerOutput>({
    name: "fail-planner",
    role: "Planner",
    instructions: "Plan",
    tools: [],
    outputSchema: plannerOutputSchema,
    maxSteps: 1,
  });

  const parent = new Agent({
    name: "parent",
    role: "Parent",
    instructions: "Coordinate",
    tools: [],
    outputSchema: z.array(z.any()),
    planner,
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
        // First call: planner
        if (calls.length === 1) {
          return JSON.stringify({
            plan: "use both",
            subagents: [
              { name: "failing-child", prompt: "Do part 1" },
              { name: "other-child", prompt: "Do part 2" },
            ],
          });
        }
        // Second call: failing-child
        if (calls.length === 2) {
          throw new Error("subagent-boom");
        }
        // Third call: other-child
        return JSON.stringify({});
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
    const value = result.value as any[];
    assert.equal(value.length, 2);
    assert.equal(value[0].agentName, "failing-child");
    assert.equal(value[0].ok, false);
    assert.equal(value[1].agentName, "other-child");
    assert.equal(value[1].ok, true);
  }

  AgentRegistry.clear();
});
