import { useConfig } from "../context/ConfigContext.js";
import { useCredential, useNavigation, useNotification } from "../context/index.js";
import { saveConfig, type ProviderName } from "../config.js";
import { getProvider, PROVIDER_REGISTRY } from "../core/llm/registry.js";

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
    return config[entry.modelField] ?? entry.modelDefault;
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
        setCredentialField(p.apiKeyField as any);
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
      // API key already configured — skip credential input
      setView("MODEL_SELECT");
      return;
    }

    setCredentialField(entry.apiKeyField as any);
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
    notify(`Switched to ${entry.label} / ${model}.`, "success");
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

    // Auto-advance to model selection if this was a provider API key
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
        const isConfigured = !!(config as any)[provider.apiKeyField];
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

    const items = providers.flatMap((provider) =>
      provider.recommendedModels.map((model) => {
        const currentModel = config[provider.modelField] === model;
        const isActive = config.LLM_PROVIDER === provider.id && currentModel;

        return {
          label: `[${provider.label}] ${model}${isActive ? " [active]" : ""}`,
          value: `${provider.id}:${model}`,
        };
      }),
    );

    // When filtered to a provider, offer a "Show all" option at the top
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
