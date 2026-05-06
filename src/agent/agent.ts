import { ToolLoopAgent } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { fileTools } from "./tools/index.js";
import { getSetting } from "../db/index.js";
import { systemPrompt } from "./prompt.js";
export { systemPrompt };
export function createAgent(instructions?: string, extraTools?: Record<string, any>) {
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
      ...fileTools,
      ...extraTools,
    },
  });
}
