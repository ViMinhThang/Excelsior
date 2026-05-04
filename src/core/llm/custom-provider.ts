import fs from "node:fs";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { CONFIG_JSON_PATH } from "../../constants.js";
import type { ProviderDefinition } from "./types.js";

export interface CustomProviderEntry {
  /** Display label shown in the UI provider list */
  label: string;
  /** Base URL for the OpenAI-compatible API (e.g. https://api.example.com/v1) */
  baseURL: string;
  /** Env var name that holds the API key (e.g. MY_PROVIDER_API_KEY) */
  apiKeyEnvVar: string;
  /** Default model to use if the env var override is not set */
  modelDefault: string;
  /** List of recommended/available models for this provider */
  models?: string[];
}

/**
 * Full structure of ~/.excelsior/config.json
 */
export interface ConfigJson {
  customProviders?: Record<string, CustomProviderEntry>;
  /**
   * Universal call settings that apply to all providers.
   * Overridden by env vars, overrides provider defaults.
   */
  callOptions?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    maxRetries?: number;
    timeout?: number;
  };
  /**
   * Provider-specific options passed through to generateText() as providerOptions.
   * Keyed by provider ID, value is namespaced by SDK key.
   * Example:
   *   "anthropic": { "thinking": { "type": "enabled", "budgetTokens": 16000 } }
   */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Read and parse the full ~/.excelsior/config.json file.
 * Returns an empty ConfigJson if the file doesn't exist or is invalid.
 */
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

/**
 * Read ~/.excelsior/config.json and return the custom provider entries.
 * Returns an empty map if the file doesn't exist or is invalid.
 */
export function loadCustomProviderEntries(): Record<string, CustomProviderEntry> {
  return loadConfigJson().customProviders ?? {};
}

/**
 * Build a ProviderDefinition from a custom provider config entry.
 */
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
      });
      return provider(modelName);
    },
  };
}
