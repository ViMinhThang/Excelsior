import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ProviderDefinition } from "../types.js";

export const openrouterProvider: ProviderDefinition = {
  id: "openrouter",
  label: "OpenRouter",
  apiKeyField: "OPENROUTER_API_KEY",
  modelField: "OPENROUTER_MODEL",
  modelDefault: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  recommendedModels: [
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "google/gemini-2.0-flash-001",
    "anthropic/claude-3.5-sonnet",
  ],
  npm: "@openrouter/ai-sdk-provider",
  createModel: (config, modelName) =>
    createOpenRouter({
      apiKey: config.OPENROUTER_API_KEY ?? "",
    })(modelName),
  defaultOptions: {
    maxOutputTokens: 4096,
  },
};
