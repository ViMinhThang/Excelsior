import { ProviderError } from "../llm/errors.js";
import { buildSystemPrompt } from "./prompts.js";
import type { AgentRunInput } from "./types.js";

export interface AgentRunnerConfig {
  name: string;
  role: string;
  instructions: string;
  tools: string[];
  maxSteps: number;
}

export async function executeAgentTurn(
  agent: AgentRunnerConfig,
  input: AgentRunInput,
  prompt: string,
): Promise<string> {
  if (!input.runtime.provider) {
    throw new ProviderError(
      "MissingProvider",
      `${agent.name} skipped because no LLM provider is configured.`,
    );
  }

  return input.runtime.provider.runTurn({
    systemPrompt: buildSystemPrompt(
      [`Agent: ${agent.name}`, `Role: ${agent.role}`, agent.instructions].join(
        "\n\n",
      ),
      input.runtime.memory,
      input.mode,
    ),
    prompt,
    cwd: input.cwd ?? input.runtime.workspaceRoot,
    maxSteps: input.maxSteps ?? agent.maxSteps,
    tools: agent.tools,
    signal: input.signal,
  });
}
