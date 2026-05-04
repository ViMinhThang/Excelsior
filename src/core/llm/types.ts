import { type LanguageModel } from "ai";

/**
 * Provider-level defaults for options passed to generateText().
 * These are the lowest-priority source and can be overridden
 * by config.json callOptions and env vars.
 */
export interface ProviderDefaults {
  /** Temperature (0-2, provider-specific range) */
  temperature?: number;
  /** Nucleus sampling threshold (0-1) */
  topP?: number;
  /** Maximum tokens in the generated response */
  maxOutputTokens?: number;
  /** Maximum retry attempts on API failure */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /**
   * Provider-specific options passed as providerOptions in generateText().
   * Keyed by SDK namespace (e.g. "anthropic", "openai", "google").
   */
  providerOptions?: Record<string, Record<string, unknown>>;
}

export interface ProviderDefinition {
  id: string;
  label: string;
  apiKeyField: string;
  modelField: string;
  modelDefault: string;
  recommendedModels: string[];
  createModel: (config: Record<string, string | undefined>, modelName: string) => LanguageModel;
  /** Provider-level defaults for generateText() call options */
  defaultOptions?: ProviderDefaults;
}
