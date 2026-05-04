import { useConfig } from "../context/ConfigContext.js";
import { useCredential, useNavigation, useNotification } from "../context/index.js";
import { saveConfig, type ProviderName } from "../config.js";
import { getProvider, PROVIDER_REGISTRY } from "../core/llm/registry.js";
import { getModelVariants, parseVariantModel } from "../core/llm/variants.js";

function formatContextWindow(context: number): string {
  if (context >= 1_000_000) return `${(context / 1_000_000).toFixed(0)}M`;
  if (context >= 1_000) return `${(context / 1_000).toFixed(0)}K`;
  return `${context}`;
}

function formatCost(cost: { input?: number; output?: number } | undefined): string {
  if (!cost) return "";
  const inCost = cost.input ?? 0;
  const outCost = cost.output ?? 0;
  if (inCost === 0 && outCost === 0) return "free";
  return `$${(inCost * 1_000_000).toFixed(2)}/${(outCost * 1_000_000).toFixed(2)}/M`;
}

type CredentialApiKeyField = (typeof PROVIDER_REGISTRY)[number]["apiKeyField"];

export function useSettingsActions() {
  const { config, refreshConfig } = useConfig();
  const { credentialField, setCredentialField, setCredentialInput } = useCredential();
  const { setView } = useNavigation();
  const { notify } = useNotification();

  function getActiveProviderLabel(): string {
    const entry = getProvider(config.LLM_PROVIDER);
    return entry?.label ?? config.LLM_PROVIDER;
  }

  function getActiveModelLabel(): string {
    const entry = getProvider(config.LLM_PROVIDER);
    if (!entry) return "Unknown";
    const raw = config[entry.modelField] ?? entry.modelDefault;
    const { baseModelId, effort } = parseVariantModel(raw);
    return effort ? `${baseModelId} (${effort})` : raw;
  }

  function handleSettingsSelect(value: string): void {
    if (value === "provider") {
      setView("PROVIDER_SELECT");
      return;
    }

    if (value === "model") {
      setView("MODEL_SELECT");
      return;
    }

    for (const p of PROVIDER_REGISTRY) {
      if (value === `${p.id}_key`) {
        setCredentialField(p.apiKeyField as CredentialApiKeyField);
        setCredentialInput(config[p.apiKeyField] ?? "");
        setView("CREDENTIAL_INPUT");
        return;
      }
    }

    if (value === "github_token") {
      setCredentialField("GITHUB_TOKEN");
      setCredentialInput(config.GITHUB_TOKEN ?? "");
      setView("CREDENTIAL_INPUT");
      return;
    }

    setView("MAIN");
  }

  function handleProviderSelect(provider: ProviderName | "back"): void {
    if (provider === "back") {
      setView("SETTINGS");
      return;
    }

    const entry = getProvider(provider);
    if (!entry) return;

    saveConfig({ LLM_PROVIDER: provider });
    refreshConfig();
    notify(`Provider set to ${entry.label}.`, "success");

    if (config[entry.apiKeyField]) {
      setView("MODEL_SELECT");
      return;
    }

    setCredentialField(entry.apiKeyField as CredentialApiKeyField);
    setCredentialInput(config[entry.apiKeyField] ?? "");

    setView("CREDENTIAL_INPUT");
  }

  function handleModelSelect(value: string): void {
    if (value === "back") {
      setView("SETTINGS");
      return;
    }

    if (value === "__all") {
      setView("MODEL_SELECT");
      return;
    }

    const [providerId, ...modelParts] = value.split(":");
    if (!providerId) return;

    const model = modelParts.join(":");
    const entry = getProvider(providerId);
    if (!entry) return;

    saveConfig({
      LLM_PROVIDER: providerId as ProviderName,
      [entry.modelField as string]: model,
    });
    refreshConfig();
    notify(`Switched to ${entry.label} / ${getActiveModelLabel()}.`, "success");
    setView("SETTINGS");
  }

  function handleCredentialSubmit(value: string): void {
    if (!credentialField) {
      setView("MAIN");
      return;
    }

    saveConfig({ [credentialField]: value.trim() } as Partial<typeof config>);
    refreshConfig();
    setCredentialInput("");
    setCredentialField(null);

    for (const p of PROVIDER_REGISTRY) {
      if (credentialField === p.apiKeyField) {
        notify("Credential saved.", "success");
        setView("MODEL_SELECT");
        return;
      }
    }

    setView("SETTINGS");
    notify("Credential saved.", "success");
  }

  function credentialTitle(): string {
    if (credentialField === "GITHUB_TOKEN") {
      return "Enter GitHub Token";
    }

    for (const p of PROVIDER_REGISTRY) {
      if (credentialField === p.apiKeyField) {
        return `Enter ${p.label} API Key`;
      }
    }

    return "Enter value";
  }

  function getProviderOptions() {
    return [
      ...PROVIDER_REGISTRY.map((provider) => {
        const isConfigured = !!(config as Record<string, string | undefined>)[provider.apiKeyField];
        const activeSuffix = config.LLM_PROVIDER === provider.id ? " [active]" : "";
        const configSuffix = isConfigured ? " (configured)" : " (missing key)";

        return {
          label: `${provider.label}${configSuffix}${activeSuffix}`,
          value: provider.id,
        };
      }),
      { label: "Back", value: "back" as const },
    ];
  }

  function getModelOptions(providerId?: string) {
    const providers = providerId
      ? (() => {
          const p = getProvider(providerId);
          return p ? [p] : [];
        })()
      : PROVIDER_REGISTRY;

    if (!providers.length) {
      return [{ label: "Back", value: "back" as const }];
    }

    const items: Array<{ label: string; value: string }> = [];

    for (const provider of providers) {
      const catalogModels = provider.models;
      const modelIds = provider.recommendedModels;
      const isCurrentProvider = config.LLM_PROVIDER === provider.id;

      for (const modelId of modelIds) {
        const isActive = isCurrentProvider && config[provider.modelField] === modelId;
        let suffix = "";

        if (catalogModels?.[modelId]) {
          const info = catalogModels[modelId];
          const ctx = formatContextWindow(info.limit.context);
          const cost = formatCost(info.cost);
          const reasoningTag = info.capabilities.reasoning ? " [reasoning]" : "";
          suffix = ` (${ctx}${cost ? `, ${cost}` : ""})${reasoningTag}${isActive ? " [active]" : ""}`;
        } else {
          suffix = isActive ? " [active]" : "";
        }

        items.push({
          label: `[${provider.label}] ${modelId}${suffix}`,
          value: `${provider.id}:${modelId}`,
        });

        if (catalogModels?.[modelId]?.capabilities.reasoning && isCurrentProvider) {
          const variants = getModelVariants(provider.id, modelId, modelId);
          for (const v of variants) {
            const isVariantActive = isCurrentProvider && config[provider.modelField] === v.id;
            items.push({
              label: `  ${v.label}${isVariantActive ? " [active]" : ""}`,
              value: `${provider.id}:${v.id}`,
            });
          }
        }
      }
    }

    if (providerId) {
      items.unshift({ label: "Show all providers", value: "__all" as const });
    }

    items.push({ label: "Back", value: "back" as const });
    return items;
  }

  return {
    handleSettingsSelect,
    handleProviderSelect,
    handleModelSelect,
    handleCredentialSubmit,
    credentialTitle,
    getProviderOptions,
    getModelOptions,
    getActiveProviderLabel,
    getActiveModelLabel,
  };
}
