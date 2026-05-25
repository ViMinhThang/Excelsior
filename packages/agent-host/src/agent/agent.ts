import { ToolLoopAgent } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFileTools } from "./tools/index.js";
import { getSetting } from "../persistence/db.js";
import { buildSystemPrompt } from "./prompt.js";
import type { ToolContext } from "../tooling/context.js";
import type { StreamCapableAgent } from "../runtime/agentStream.js";

export function createAgent(
  instructions?: string,
  extraTools?: Record<string, unknown>,
  ctx?: ToolContext,
): StreamCapableAgent {
  const systemPrompt = buildSystemPrompt(ctx?.mode);
  const apiKey = getSetting("DEEPSEEK_API_KEY");
  const deepseek = createDeepSeek({
    apiKey: apiKey || process.env.DEEPSEEK_API_KEY,
  });
  const model = deepseek("deepseek-v4-flash");

  const finalInstructions = instructions
    ? `${systemPrompt}\n\n---\n${instructions}\n---`
    : systemPrompt;

  return new ToolLoopAgent({
    model,
    instructions: finalInstructions,
    tools: {
      ...createFileTools(ctx),
      ...extraTools,
    },
  }) as StreamCapableAgent;
}
