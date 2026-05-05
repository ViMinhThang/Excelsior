import { ToolLoopAgent } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { fileTools } from "./tools/index.js";
import { getSetting } from "../db/index.js";
import { systemPrompt } from "./prompt.js";
export function createAgent() {
  const apiKey = getSetting("DEEPSEEK_API_KEY");
  const deepseek = createDeepSeek({
    apiKey: apiKey || process.env.DEEPSEEK_API_KEY,
  });
  const model = deepseek("deepseek-v4-flash");

  return new ToolLoopAgent({
    model,
    instructions: systemPrompt,
    tools: {
      ...fileTools,
    },
  });
}
