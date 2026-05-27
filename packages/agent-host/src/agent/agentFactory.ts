import { createAgent } from "./agent.js";
import type { StreamCapableAgent } from "../runtime/agentStream.js";
import { createSpawnSubAgentTool } from "./spawn/spawnSubAgent.js";
import type { RunContext } from "../application/turns/runSession.js";

export interface AgentFactory {
  create(
    runCtx: RunContext,
    options?: {
      instructions?: string;
      extraTools?: Record<string, unknown>;
    },
  ): StreamCapableAgent;
}

export class DefaultAgentFactory implements AgentFactory {
  create(
    runCtx: RunContext,
    options?: {
      instructions?: string;
      extraTools?: Record<string, unknown>;
    },
  ): StreamCapableAgent {
    const spawnSubAgentTool = createSpawnSubAgentTool(
      runCtx.run,
      runCtx.childRuns,
      runCtx.run.sessionId,
      runCtx.ctx,
      runCtx.recorder,
      runCtx.subAgentEvents,
      {
        createAgent: (subInstructions, extraTools, subCtx) => {
          return createAgent(subInstructions, extraTools, subCtx);
        },
      },
    );

    return createAgent(
      options?.instructions,
      {
        spawnSubAgent: spawnSubAgentTool,
        ...options?.extraTools,
      },
      runCtx.ctx,
    );
  }
}
