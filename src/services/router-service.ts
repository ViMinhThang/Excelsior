import { generateObject } from "ai";
import { z } from "zod";

import type { Config } from "../config.js";
import { createAgentProvider } from "../core/provider.js";

export async function routePrompt(
  prompt: string,
  config: Config
): Promise<{ intent: "CHAT" | "REVIEW"; prNumber?: number | undefined }> {
  const provider = createAgentProvider(config);
  
  if (!provider) {
    throw new Error("No valid LLM provider configured. Please check your settings.");
  }

  const { object } = await generateObject({
    model: provider.aiModel,
    system: `You are a helpful intent routing assistant.
Your job is to determine whether the user wants to CHAT (general questions, help, conversation) or REVIEW a pull request.
If the user wants to review a pull request, try to extract the pull request number if they provided one.
Return a JSON object with 'intent' (either "CHAT" or "REVIEW") and an optional 'prNumber' (number).`,
    prompt: `User prompt: ${prompt}`,
    schema: z.object({
      intent: z.enum(["CHAT", "REVIEW"]),
      prNumber: z.number().optional(),
    }),
  });

  return object;
}
