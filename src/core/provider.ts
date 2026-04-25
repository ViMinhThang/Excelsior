import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs, type LanguageModel } from "ai";

import { loadConfig, type Config, type ProviderName } from "../config.js";
import { globalMemory } from "../mem/memory-manager.js";
import { ACT_MODE_INSTRUCTIONS, BASE_SYSTEM_PROMPT, PLAN_MODE_INSTRUCTIONS } from "./prompts.js";

type ProviderConfigKey = "GEMINI_API_KEY" | "ANTHROPIC_API_KEY";
type ModelConfigKey = "GEMINI_MODEL" | "ANTHROPIC_MODEL";

interface ProviderCatalogEntry {
  label: string;
  apiKeyField: ProviderConfigKey;
  modelField: ModelConfigKey;
  createModel: (config: Config, modelName: string) => LanguageModel;
}

export interface ReviewModelClient {
  provider: ProviderName;
  label: string;
  model: string;
  generate(args: { system: string; prompt: string; cwd: string; maxSteps?: number }): Promise<string>;
}

export const PROVIDER_CATALOG: Record<ProviderName, ProviderCatalogEntry> = {
  google: {
    label: "Google Gemini",
    apiKeyField: "GEMINI_API_KEY",
    modelField: "GEMINI_MODEL",
    createModel: (config, modelName) =>
      createGoogleGenerativeAI({ apiKey: config.GEMINI_API_KEY ?? "" })(modelName),
  },
  anthropic: {
    label: "Anthropic",
    apiKeyField: "ANTHROPIC_API_KEY",
    modelField: "ANTHROPIC_MODEL",
    createModel: (config, modelName) =>
      createAnthropic({ apiKey: config.ANTHROPIC_API_KEY ?? "" })(modelName),
  },
};

export const RECOMMENDED_MODELS: Record<ProviderName, string[]> = {
  google: ["gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  anthropic: [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
};

export function getProviderLabel(provider: ProviderName): string {
  return PROVIDER_CATALOG[provider].label;
}

export function listProviderOptions(config: Config = loadConfig()): Array<{
  label: string;
  value: ProviderName;
  description: string;
}> {
  return (Object.keys(PROVIDER_CATALOG) as ProviderName[]).map((provider) => {
    const entry = PROVIDER_CATALOG[provider];
    const configured = Boolean(config[entry.apiKeyField]);
    return {
      label: entry.label,
      value: provider,
      description: configured ? "configured" : "missing API key",
    };
  });
}

export function createReviewModelClient(config: Config = loadConfig()): ReviewModelClient | null {
  const provider = config.LLM_PROVIDER;
  const entry = PROVIDER_CATALOG[provider];
  const apiKey = config[entry.apiKeyField];

  if (!apiKey) {
    return null;
  }

  const modelName = config[entry.modelField];
  const model = entry.createModel(config, modelName);

  return {
    provider,
    label: entry.label,
    model: modelName,
    async generate({ system, prompt, cwd: _cwd, maxSteps = 5 }) {
      const mode = globalMemory.getMode();
      const modeInstructions =
        mode === "PLAN" ? PLAN_MODE_INSTRUCTIONS : ACT_MODE_INSTRUCTIONS;
      const memories = globalMemory.getRecentObservations();
      const systemPrompt = [
        BASE_SYSTEM_PROMPT,
        system,
        `Current mode: ${mode}`,
        modeInstructions,
        "Recent observations:",
        memories.length > 0 ? memories.join("\n") : "(none)",
      ].join("\n\n");

      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt,
        stopWhen: stepCountIs(maxSteps),
      });

      return text.trim();
    },
  };
}
