import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ProviderDefinition } from "../types.js";

export const googleProvider: ProviderDefinition = {
  id: "google",
  label: "Google Gemini",
  apiKeyField: "GEMINI_API_KEY",
  modelField: "GEMINI_MODEL",
  modelDefault: "gemini-2.5-flash",
  recommendedModels: ["gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  npm: "@ai-sdk/google",
  createModel: (config, modelName) =>
    createGoogleGenerativeAI({ apiKey: config.GEMINI_API_KEY ?? "" })(modelName),
  defaultOptions: {
    maxOutputTokens: 8192,
  },
};
