import type { Config } from "../config.js";
import type { MemoryManager } from "../mem/memory-manager.js";
import { createAgentProvider, type AgentProvider } from "./llm/provider.js";
import { noopLogger, type Logger } from "./logger.js";

export interface RuntimeContext {
  config: Config;
  workspaceRoot: string;
  provider: AgentProvider | null;
  memory: MemoryManager;
  logger: Logger;
}

export function createRuntimeContext(args: {
  config: Config;
  workspaceRoot: string;
  memory: MemoryManager;
  logger?: Logger;
  provider?: AgentProvider | null;
}): RuntimeContext {
  return {
    config: args.config,
    workspaceRoot: args.workspaceRoot,
    provider: args.provider ?? createAgentProvider(args.config),
    memory: args.memory,
    logger: args.logger ?? noopLogger,
  };
}
