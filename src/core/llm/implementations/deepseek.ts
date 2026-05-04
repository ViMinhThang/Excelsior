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
  models: {
    "deepseek-v4-pro": {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolCall: true,
        input: ["text"],
        output: ["text"],
      },
      limit: {
        context: 128000,
        output: 8192,
      },
    },
    "deepseek-v4-flash": {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolCall: true,
        input: ["text"],
        output: ["text"],
      },
      limit: {
        context: 128000,
        output: 8192,
      },
    },
  },
  defaultOptions: {
    maxOutputTokens: 8192,
  },
};
