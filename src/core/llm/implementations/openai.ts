import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderDefinition } from "../types.js";

export const openaiProvider: ProviderDefinition = {
  id: "openai",
  label: "OpenAI",
  apiKeyField: "OPENAI_API_KEY",
  modelField: "OPENAI_MODEL",
  modelDefault: "gpt-4o",
  recommendedModels: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
  ],
  npm: "@ai-sdk/openai",
  createModel: (config, modelName) =>
    createOpenAI({ apiKey: config.OPENAI_API_KEY ?? "" })(modelName),
  defaultOptions: {
    maxOutputTokens: 16384,
  },
};
