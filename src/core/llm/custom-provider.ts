import fs from "node:fs";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { CONFIG_JSON_PATH } from "../../constants.js";
import type { ProviderDefinition } from "./types.js";

export interface CustomProviderEntry {
  label: string;
  baseURL: string;
  apiKeyEnvVar: string;
  modelDefault: string;
  models?: string[];
  options?: {
    timeout?: number;
    headers?: Record<string, string>;
  };
}

export interface ConfigJson {
  customProviders?: Record<string, CustomProviderEntry>;
  callOptions?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    maxRetries?: number;
    timeout?: number;
  };
  providerOptions?: Record<string, Record<string, unknown>>;
  providerSettings?: Record<string, {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
    options?: Record<string, unknown>;
  }>;
}

export function loadConfigJson(): ConfigJson {
  if (!fs.existsSync(CONFIG_JSON_PATH)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(CONFIG_JSON_PATH, "utf-8");
    return JSON.parse(raw) as ConfigJson;
  } catch {
    return {};
  }
}

export function loadCustomProviderEntries(): Record<string, CustomProviderEntry> {
  return loadConfigJson().customProviders ?? {};
}

export function createCustomProvider(
  id: string,
  config: CustomProviderEntry,
): ProviderDefinition {
  const modelFieldKey = `${id.toUpperCase().replace(/-/g, "_")}_MODEL`;

  return {
    id,
    label: config.label,
    apiKeyField: config.apiKeyEnvVar,
    modelField: modelFieldKey,
    modelDefault: config.modelDefault,
    recommendedModels: config.models ?? [config.modelDefault],
    createModel: (cfg: Record<string, string | undefined>, modelName: string) => {
      const provider = createOpenAICompatible({
        name: id,
        baseURL: config.baseURL,
        apiKey: cfg[config.apiKeyEnvVar] ?? "",
        ...(config.options?.headers ? { headers: config.options.headers } : {}),
      });
      return provider(modelName);
    },
  };
}
