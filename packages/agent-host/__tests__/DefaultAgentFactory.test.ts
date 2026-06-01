import { describe, expect, it, vi } from "vitest";
import { DefaultAgentFactory } from "../src/agent/DefaultAgentFactory.js";
import { AgentRun } from "../src/runtime/agentRun.js";
import { createSubAgentEventSink } from "../src/runtime/subAgentEventSink.js";
import { createToolContext } from "../src/testing/tools.js";
import type { RunRecorder } from "../src/testing/runtime.js";
import { z } from "zod";
import { tool } from "ai";

describe("DefaultAgentFactory", () => {
  it("initializes a DefaultAgentFactory and creates an ExcelsiorAgent with spawnSubAgent and extraTools", () => {
    const run = new AgentRun({ sessionId: "ses_test" });
    const childRuns = new Map();
    const ctx = createToolContext({
      abortSignal: run.abortSignal,
      mode: "plan",
      workspaceRoot: "/tmp",
    });
    const subAgentEvents = createSubAgentEventSink();

    const recorder: RunRecorder = {
      append: vi.fn(async () => {}),
      load: vi.fn(async () => []),
      delete: vi.fn(async () => {}),
      deleteAll: vi.fn(async () => {}),
      completeTurn: vi.fn(async () => {}),
      recordEvent: vi.fn(async () => {}),
      recordTurnComplete: vi.fn(async () => {}),
      loadCompletedEvents: vi.fn(async () => []),
      loadRawEvents: vi.fn(async () => []),
      getLastCompletedTurn: vi.fn(async () => null),
      dropLastCompletedTurn: vi.fn(async () => ({
        dropped: false,
        removedEvents: 0,
        reason: "no-completed-turn" as const,
      })),
      deleteSessionEvents: vi.fn(async () => {}),
      deleteAllSessionEvents: vi.fn(async () => {}),
    };

    const dummyTool = tool({
      description: "dummy description",
      inputSchema: z.object({}),
      execute: async () => "dummy",
    });

    const factory = new DefaultAgentFactory({
      dummy: dummyTool,
    });

    const agent = factory.create({
      runContext: {
        ctx,
        run,
        childRuns,
        recorder,
        subAgentEvents,
      },
      mode: "plan",
    });

    expect(agent).toBeDefined();
    expect(typeof agent.stream).toBe("function");

    // Inspect the underlying agent loop properties to verify tools are registered
    const toolLoopAgent = Reflect.get(agent, "agent") as {
      tools: Record<string, unknown>;
    };
    expect(toolLoopAgent).toBeDefined();
    expect(toolLoopAgent.tools).toHaveProperty("spawnSubAgent");
    expect(toolLoopAgent.tools).toHaveProperty("dummy");
  });
});
