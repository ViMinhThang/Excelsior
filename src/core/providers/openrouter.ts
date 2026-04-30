import { createOpenAI } from "@ai-sdk/openai";
import { ProviderDefinition } from "./types.js";

export const openrouterProvider: ProviderDefinition = {
  id: "openrouter",
  label: "OpenRouter",
  apiKeyField: "OPENROUTER_API_KEY",
  modelField: "OPENROUTER_MODEL",
  recommendedModels: [
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "google/gemini-2.0-flash-001",
    "anthropic/claude-3.5-sonnet",
  ],
  createModel: (config, modelName) =>
    createOpenAI({
      apiKey: config.OPENROUTER_API_KEY ?? "",
      baseURL: "https://openrouter.ai/api/v1",
    })(modelName),
};
