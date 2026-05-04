import { anthropicProvider } from "./implementations/anthropic.js";
import { deepseekProvider } from "./implementations/deepseek.js";
import { googleProvider } from "./implementations/google.js";
import { openrouterProvider } from "./implementations/openrouter.js";
import { createCustomProvider, loadCustomProviderEntries } from "./custom-provider.js";
import { ProviderDefinition } from "./types.js";

const BUILT_IN_PROVIDERS: ProviderDefinition[] = [
  googleProvider,
  anthropicProvider,
  deepseekProvider,
  openrouterProvider,
];

export const PROVIDER_REGISTRY: ProviderDefinition[] = [...BUILT_IN_PROVIDERS];

let _initialized = false;

/**
 * Load and register custom providers from ~/.excelsior/config.json.
 * Must be called before any provider lookups that need custom providers.
 * Idempotent — safe to call multiple times.
 */
export function initRegistry(): void {
  if (_initialized) return;
  _initialized = true;

  const entries = loadCustomProviderEntries();
  for (const [id, config] of Object.entries(entries)) {
    const def = createCustomProvider(id, config);
    PROVIDER_REGISTRY.push(def);
  }
}

// Initialize at module load so config.ts can build its schema with all providers.
// Also exported for explicit re-init if needed.
initRegistry();

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id) as ProviderDefinition | undefined;
}

export function getProviderIds(): string[] {
  return PROVIDER_REGISTRY.map((p) => p.id);
}
