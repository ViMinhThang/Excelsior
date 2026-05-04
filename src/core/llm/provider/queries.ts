import { loadConfig, type Config, type ProviderName } from "../../../config.js";
import { PROVIDER_REGISTRY, getProvider } from "../registry.js";

export function getProviderLabel(provider: ProviderName): string {
  return getProvider(provider)?.label ?? provider;
}

export function getActiveModelName(config: Config): string {
  const entry = getProvider(config.LLM_PROVIDER);
  if (!entry) return "Unknown";
  return config[entry.modelField] ?? "Unknown";
}

export function listProviderOptions(): Array<{
  label: string;
  value: ProviderName;
  description: string;
}> {
  const config = loadConfig();
  return PROVIDER_REGISTRY.map((entry) => {
    const configured = Boolean(config[entry.apiKeyField]);
    return {
      label: entry.label,
      value: entry.id as ProviderName,
      description: configured ? "configured" : "missing API key",
    };
  });
}
