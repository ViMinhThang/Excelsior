import { describe, expect, it, vi } from "vitest";
import { DefaultAgentFactory } from "../src/agent/DefaultAgentFactory.js";
import { AgentRun } from "../src/runtime/agentRun.js";
import { createSubAgentEventSink } from "../src/runtime/subAgentEventSink.js";
import { createToolContext } from "../src/tooling/context.js";
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

    const recorder = {
      recordEvent: vi.fn(),
      recordTurnComplete: vi.fn(),
      loadCompletedEvents: vi.fn(),
      loadRawEvents: vi.fn(),
      getLastCompletedTurn: vi.fn(),
      dropLastCompletedTurn: vi.fn(),
      deleteSessionEvents: vi.fn(),
      deleteAllSessionEvents: vi.fn(),
    } as any;

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
    const excelsiorAgent = agent as any;
    expect(excelsiorAgent.agent).toBeDefined();
    expect(excelsiorAgent.agent.tools).toHaveProperty("spawnSubAgent");
    expect(excelsiorAgent.agent.tools).toHaveProperty("dummy");
  });
});
