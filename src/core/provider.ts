import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs, type LanguageModel } from "ai";

import { loadConfig, type Config, type ProviderName } from "../config.js";
import { getTools } from "../tools/index.js";

type ProviderConfigKey = "GEMINI_API_KEY" | "ANTHROPIC_API_KEY";
type ModelConfigKey = "GEMINI_MODEL" | "ANTHROPIC_MODEL";

interface ProviderCatalogEntry {
  label: string;
  apiKeyField: ProviderConfigKey;
  modelField: ModelConfigKey;
  createModel: (config: Config, modelName: string) => LanguageModel;
}

export interface AgentProvider {
  provider: ProviderName;
  label: string;
  model: string;
  runTurn(args: {
    systemPrompt: string;
    prompt: string;
    cwd: string;
    maxSteps?: number;
  }): Promise<string>;
}

export const PROVIDER_CATALOG: Record<ProviderName, ProviderCatalogEntry> = {
  google: {
    label: "Google Gemini",
    apiKeyField: "GEMINI_API_KEY",
    modelField: "GEMINI_MODEL",
    createModel: (config, modelName) =>
      createGoogleGenerativeAI({ apiKey: config.GEMINI_API_KEY ?? "" })(
        modelName,
      ),
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

export function createAgentProvider(
  config: Config = loadConfig(),
): AgentProvider | null {
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
    async runTurn({ systemPrompt, prompt, cwd, maxSteps = 5 }) {
      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt,
        tools: getTools(cwd),
        stopWhen: stepCountIs(maxSteps),
      });

      return text.trim();
    },
  };
}
