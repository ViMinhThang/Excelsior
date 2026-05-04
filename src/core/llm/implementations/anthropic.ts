import { createAnthropic } from "@ai-sdk/anthropic";
import type { ProviderDefinition } from "../types.js";

export const anthropicProvider: ProviderDefinition = {
  id: "anthropic",
  label: "Anthropic",
  apiKeyField: "ANTHROPIC_API_KEY",
  modelField: "ANTHROPIC_MODEL",
  modelDefault: "claude-sonnet-4-20250514",
  recommendedModels: [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  npm: "@ai-sdk/anthropic",
  createModel: (config, modelName) =>
    createAnthropic({ apiKey: config.ANTHROPIC_API_KEY ?? "" })(modelName),
  defaultOptions: {
    maxOutputTokens: 8192,
    providerOptions: {
      anthropic: {
        thinking: { type: "adaptive" },
      },
    },
  },
};
