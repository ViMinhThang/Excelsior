import { useConfig } from "../context/ConfigContext.js";
import { useUI } from "../context/UIContext.js";
import { saveConfig, type Config, type ProviderName } from "../config.js";
import { getProvider, PROVIDER_REGISTRY } from "../core/llm/registry.js";

export function useSettingsActions() {
  const { config, refreshConfig } = useConfig();
  const { 
    credentialField, 
    setCredentialField, 
    setCredentialInput, 
    setView,
    notify
  } = useUI();

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
        const field = p.apiKeyField as keyof Config;
        setCredentialField(field as any);
        setCredentialInput((config as any)[field] ?? "");
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

    const field = entry.apiKeyField as keyof Config;
    setCredentialField(field as any);
    setCredentialInput((config as any)[field] ?? "");

    setView("CREDENTIAL_INPUT");
  }

  function handleModelSelect(value: string): void {
    if (value === "back") {
      setView("SETTINGS");
      return;
    }

    const [providerId, ...modelParts] = value.split(":");
    if (!providerId) return;

    const model = modelParts.join(":");
    const entry = getProvider(providerId);

    if (!entry) return;

    saveConfig({
      LLM_PROVIDER: providerId as ProviderName,
      [entry.modelField]: model,
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

  function getModelOptions() {
    return [
      ...PROVIDER_REGISTRY.flatMap((provider) =>
        provider.recommendedModels.map((model) => {
          const currentModel = config[provider.modelField as keyof Config] === model;
          const isActive = config.LLM_PROVIDER === provider.id && currentModel;

          return {
            label: `[${provider.label}] ${model}${isActive ? " [active]" : ""}`,
            value: `${provider.id}:${model}`,
          };
        }),
      ),
      { label: "Back", value: "back" },
    ];
  }

  return {
    handleSettingsSelect,
    handleProviderSelect,
    handleModelSelect,
    handleCredentialSubmit,
    credentialTitle,
    getProviderOptions,
    getModelOptions,
  };
}
