import { google } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";
import { loadConfig } from "../config.js";
import { tools } from "./tools.js";
import { globalMemory } from "./memory-manager.js";

export type ProviderName = "gemini";

export function getProvider() {
  const config = loadConfig();

  if (!config.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in configuration.");
  }

  // Set the API key for the Google provider
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = config.GEMINI_API_KEY;

  return google("gemini-1.5-pro-latest");
}

export async function runTurn(prompt: string, systemPrompt: string) {
  const model = getProvider();

  // Inject memory into system prompt
  const memories = globalMemory.getRecentObservations();
  const contextInjectedPrompt =
    memories.length > 0
      ? `${systemPrompt}\n\nRecent Observations:\n${memories.join("\n")}`
      : systemPrompt;

  const { text, steps } = await generateText({
    model,
    system: contextInjectedPrompt,
    prompt,
    tools,
    stopWhen: stepCountIs(10),
  });

  return { text, steps };
}
