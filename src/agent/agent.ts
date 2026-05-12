import { ToolLoopAgent } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFileTools } from "./tools/index.js";
import { getSetting } from "../db/index.js";
import { buildSystemPrompt } from "./prompt.js";

interface ConfirmBus {
  getListenerCount(event: "request"): number;
  on(event: "response", handler: (resp: { callId: string; approved: boolean }) => void): () => void;
  emit(event: "request", data: { callId: string; toolName: string; args: string }): void;
}

export function createAgent(
  instructions?: string,
  extraTools?: Record<string, any>,
  confirmBus?: ConfirmBus,
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
      ...createFileTools(confirmBus),
      ...extraTools,
    },
  });
}
