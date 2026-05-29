import { type AgentFactory } from "../application/turns/AgentFactory.js";
import { createAgent } from "./agent.js";
import { createSpawnSubAgentTool } from "./spawn/spawnSubAgent.js";
import type { StreamCapableAgent } from "../runtime/events.js";
import type { RunContext } from "../application/turns/runSession.js";
import type { AgentMode } from "@excelsior/core";

export class DefaultAgentFactory implements AgentFactory {
  constructor(private readonly extraTools?: Record<string, unknown>) {}

  create(input: {
    runContext: RunContext;
    instructions?: string;
    mode: AgentMode;
  }): StreamCapableAgent {
    const { runContext, instructions } = input;

    const spawnSubAgentTool = createSpawnSubAgentTool(
      runContext.run,
      runContext.childRuns,
      runContext.run.sessionId,
      runContext.ctx,
      runContext.recorder,
      runContext.subAgentEvents,
      {
        createAgent: (subInstructions, extraTools, subCtx) => {
          return createAgent(subInstructions, extraTools, subCtx);
        },
      },
    );

    return createAgent(
      instructions,
      {
        spawnSubAgent: spawnSubAgentTool,
        ...this.extraTools,
      },
      runContext.ctx,
    );
  }
}
