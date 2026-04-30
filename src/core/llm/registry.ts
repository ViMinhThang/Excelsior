import { anthropicProvider } from "./implementations/anthropic.js";
import { deepseekProvider } from "./implementations/deepseek.js";
import { googleProvider } from "./implementations/google.js";
import { openrouterProvider } from "./implementations/openrouter.js";
import { ProviderDefinition } from "./types.js";

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  googleProvider,
  anthropicProvider,
  deepseekProvider,
  openrouterProvider,
];

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function getProviderIds(): string[] {
  return PROVIDER_REGISTRY.map((p) => p.id);
}
