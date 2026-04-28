import type { Config } from "../config.js";
import { ExcelsiorAgent } from "../core/agent.js";
import { createAgentProvider } from "../core/provider.js";

export async function runChat(
  prompt: string,
  config: Config,
  cwd: string
): Promise<string> {
  const provider = createAgentProvider(config);
  
  if (!provider) {
    throw new Error("No valid LLM provider configured. Please check your settings.");
  }

  const agent = new ExcelsiorAgent(provider);

  const response = await agent.runTurn({
    rolePrompt: "You are a helpful coding assistant. Answer the user's questions to the best of your ability.",
    prompt,
    cwd,
    maxSteps: 5,
  });

  return response || "No response generated.";
}
