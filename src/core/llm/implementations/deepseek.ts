import { createDeepSeek } from "@ai-sdk/deepseek";
import type { ProviderDefinition } from "../types.js";

export const deepseekProvider: ProviderDefinition = {
  id: "deepseek",
  label: "DeepSeek",
  apiKeyField: "DEEPSEEK_API_KEY",
  modelField: "DEEPSEEK_MODEL",
  modelDefault: "deepseek-v4-flash",
  recommendedModels: ["deepseek-v4-pro", "deepseek-v4-flash"],
  npm: "@ai-sdk/deepseek",
  createModel: (config, modelName) =>
    createDeepSeek({ apiKey: config.DEEPSEEK_API_KEY ?? "" })(modelName),
  defaultOptions: {
    maxOutputTokens: 8192,
  },
};
