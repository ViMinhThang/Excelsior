import { anthropicProvider } from "./anthropic.js";
import { deepseekProvider } from "./deepseek.js";
import { googleProvider } from "./google.js";
import { openrouterProvider } from "./openrouter.js";
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
