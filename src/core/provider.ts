import { google } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";
import { loadConfig } from "../config.js";
import { tools } from "./tools.js";
import { globalMemory } from "../mem/memory-manager.js";
import { ACT_MODE_INSTRUCTIONS, PLAN_MODE_INSTRUCTIONS } from "./prompts.js";

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

  // Inject mode-specific instructions
  const mode = globalMemory.getMode();
  const modeInstructions =
    mode === "PLAN" ? PLAN_MODE_INSTRUCTIONS : ACT_MODE_INSTRUCTIONS;

  // Inject memory into system prompt
  const memories = globalMemory.getRecentObservations();
  const contextInjectedPrompt = `
${systemPrompt}

Current Mode: ${mode}
${modeInstructions}

Recent Observations:
${memories.length > 0 ? memories.join("\n") : "(no recent observations)"}
  `.trim();

  const { text, steps } = await generateText({
    model,
    system: contextInjectedPrompt,
    prompt,
    tools,
    stopWhen: stepCountIs(10),
  });

  return { text, steps };
}
