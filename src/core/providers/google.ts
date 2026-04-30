import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { ProviderDefinition } from "./types.js";

export const googleProvider: ProviderDefinition = {
  id: "google",
  label: "Google Gemini",
  apiKeyField: "GEMINI_API_KEY",
  modelField: "GEMINI_MODEL",
  recommendedModels: ["gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  createModel: (config, modelName) =>
    createGoogleGenerativeAI({ apiKey: config.GEMINI_API_KEY ?? "" })(modelName),
};
