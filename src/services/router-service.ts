import { generateObject } from "ai";
import { z } from "zod";

import type { Config } from "../config.js";
import { createAgentProvider } from "../core/provider.js";

export async function routePrompt(
  prompt: string,
  config: Config
): Promise<{ intent: "CHAT" | "REVIEW"; prNumber?: number | undefined }> {
  const reviewMatch = prompt.match(/\b(?:review|pr|pull request)\s*#?\s*(\d+)\b/i);
  if (reviewMatch?.[1]) {
    return { intent: "REVIEW", prNumber: Number(reviewMatch[1]) };
  }

  if (/\b(review|pull request|pr)\b/i.test(prompt)) {
    return { intent: "REVIEW" };
  }

  const provider = createAgentProvider(config);

  if (!provider) {
    return { intent: "CHAT" };
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
