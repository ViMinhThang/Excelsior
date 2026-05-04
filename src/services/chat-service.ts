import { Agent } from "../core/agent/agent.js";
import { createAgentProvider } from "../core/llm/runtime/index.js";
import { createRuntimeContext } from "../core/runtime.js";
import { Config } from "../infra/config.js";
import { ProviderError } from "../infra/errors.js";
import type { MemoryManager } from "../mem/memory-manager.js";
import { z } from "zod";

export const chatAgent = new Agent({
  name: "chat-assistant",
  role: "Coding assistant",
  instructions:
    "Answer the user's coding and project questions clearly. Use workspace tools when they help verify the answer.",
  tools: ["list_files", "read_file", "search_files"],
  outputSchema: z.object({}),
  maxSteps: 5,
  requiredProvider: true,
});

export async function runChat(
  prompt: string,
  config: Config,
  cwd: string,
  memory: MemoryManager,
): Promise<string> {
  const provider = createAgentProvider(config);

  if (!provider) {
    throw new ProviderError(
      "MissingProvider",
      "No valid LLM provider configured. Please check your settings.",
    );
  }

  const runtime = createRuntimeContext({
    config,
    workspaceRoot: cwd,
    provider,
    memory,
  });

  const response = await chatAgent.runText({
    prompt,
    runtime,
  });

  if (!response.ok) {
    throw new ProviderError("ProviderUnavailable", response.message);
  }

  return response.text || "No response generated.";
}
