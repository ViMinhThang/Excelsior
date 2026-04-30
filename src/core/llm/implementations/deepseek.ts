import { createDeepSeek } from "@ai-sdk/deepseek";
import { ProviderDefinition } from "../types.js";

export const deepseekProvider: ProviderDefinition = {
  id: "deepseek",
  label: "DeepSeek",
  apiKeyField: "DEEPSEEK_API_KEY",
  modelField: "DEEPSEEK_MODEL",
  recommendedModels: ["deepseek-v4-pro", "deepseek-v4-flash"],
  createModel: (config, modelName) =>
    createDeepSeek({ apiKey: config.DEEPSEEK_API_KEY ?? "" })(modelName),
};
