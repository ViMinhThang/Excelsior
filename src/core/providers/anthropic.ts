import { createAnthropic } from "@ai-sdk/anthropic";
import { ProviderDefinition } from "./types.js";

export const anthropicProvider: ProviderDefinition = {
  id: "anthropic",
  label: "Anthropic",
  apiKeyField: "ANTHROPIC_API_KEY",
  modelField: "ANTHROPIC_MODEL",
  recommendedModels: [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  createModel: (config, modelName) =>
    createAnthropic({ apiKey: config.ANTHROPIC_API_KEY ?? "" })(modelName),
};
