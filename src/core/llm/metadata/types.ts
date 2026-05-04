import { type LanguageModel } from "ai";

export interface ModelCapabilities {
  temperature: boolean;
  reasoning: boolean;
  attachment: boolean;
  toolCall: boolean;
  input: string[];
  output: string[];
}

export interface ModelCost {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface ModelLimit {
  context: number;
  input?: number;
  output: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  family?: string;
  capabilities: ModelCapabilities;
  cost?: ModelCost;
  limit: ModelLimit;
  status?: "alpha" | "beta" | "deprecated" | "active";
  releaseDate?: string;
  interleaved?: boolean | { field: string };
}

export interface ProviderDefaults {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  maxRetries?: number;
  timeout?: number;
  providerOptions?: Record<string, Record<string, unknown>>;
}

export interface ProviderDefinition {
  id: string;
  label: string;
  apiKeyField: string;
  modelField: string;
  modelDefault: string;
  recommendedModels: string[];
  models?: Record<string, ModelInfo>;
  npm?: string;
  api?: string;
  env?: string[];
  createModel: (config: Record<string, string | undefined>, modelName: string) => LanguageModel;
  defaultOptions?: ProviderDefaults;
}
