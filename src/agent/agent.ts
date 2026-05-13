import { ToolLoopAgent } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFileTools } from "./tools/index.js";
import { getSetting } from "../db/index.js";
import { buildSystemPrompt } from "./prompt.js";
import type { ToolContext } from "../lib/tool/context.js";

export function createAgent(
  instructions?: string,
  extraTools?: Record<string, any>,
  ctx?: ToolContext,
) {
  const platform = process.platform;
  const systemPrompt = buildSystemPrompt(platform);
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
  });
}
