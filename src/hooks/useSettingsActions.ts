import { useAppContext } from "../context/AppContext.js";
import { saveConfig } from "../config.js";

export function useSettingsActions() {
  const {
    config,
    credentialField,
    refreshConfig,
    setCredentialField,
    setCredentialInput,
    setView,
    showStatus,
  } = useAppContext();

  function handleSettingsSelect(value: string): void {
    if (value === "provider") {
      setView("PROVIDER_SELECT");
      return;
    }

    if (value === "model") {
      setView("MODEL_SELECT");
      return;
    }

    if (value === "gemini_key") {
      setCredentialField("GEMINI_API_KEY");
      setCredentialInput(config.GEMINI_API_KEY ?? "");
      setView("CREDENTIAL_INPUT");
      return;
    }

    if (value === "anthropic_key") {
      setCredentialField("ANTHROPIC_API_KEY");
      setCredentialInput(config.ANTHROPIC_API_KEY ?? "");
      setView("CREDENTIAL_INPUT");
      return;
    }

    if (value === "deepseek_key") {
      setCredentialField("DEEPSEEK_API_KEY");
      setCredentialInput(config.DEEPSEEK_API_KEY ?? "");
      setView("CREDENTIAL_INPUT");
      return;
    }

    if (value === "openrouter_key") {
      setCredentialField("OPENROUTER_API_KEY");
      setCredentialInput(config.OPENROUTER_API_KEY ?? "");
      setView("CREDENTIAL_INPUT");
      return;
    }

    if (value === "github_token") {
      setCredentialField("GITHUB_TOKEN");
      setCredentialInput(config.GITHUB_TOKEN ?? "");
      setView("CREDENTIAL_INPUT");
      return;
    }

    setView("MAIN");
  }

  function handleProviderSelect(
    provider: "google" | "anthropic" | "deepseek" | "openrouter" | "back",
  ): void {
    if (provider === "back") {
      setView("SETTINGS");
      return;
    }

    saveConfig({ LLM_PROVIDER: provider });
    refreshConfig();
    showStatus(`Provider set to ${provider}.`);

    if (provider === "google") {
      setCredentialField("GEMINI_API_KEY");
      setCredentialInput(config.GEMINI_API_KEY ?? "");
    } else if (provider === "anthropic") {
      setCredentialField("ANTHROPIC_API_KEY");
      setCredentialInput(config.ANTHROPIC_API_KEY ?? "");
    } else if (provider === "deepseek") {
      setCredentialField("DEEPSEEK_API_KEY");
      setCredentialInput(config.DEEPSEEK_API_KEY ?? "");
    } else if (provider === "openrouter") {
      setCredentialField("OPENROUTER_API_KEY");
      setCredentialInput(config.OPENROUTER_API_KEY ?? "");
    }

    setView("CREDENTIAL_INPUT");
  }

  function handleModelSelect(value: string): void {
    if (value === "back") {
      setView("SETTINGS");
      return;
    }

    const [provider, ...modelParts] = value.split(":");
    const model = modelParts.join(":");
    const modelField =
      provider === "google"
        ? "GEMINI_MODEL"
        : provider === "anthropic"
          ? "ANTHROPIC_MODEL"
          : provider === "deepseek"
            ? "DEEPSEEK_MODEL"
            : "OPENROUTER_MODEL";

    saveConfig({
      LLM_PROVIDER: provider as any,
      [modelField]: model,
    });
    refreshConfig();
    showStatus(`Switched to ${provider} / ${model}.`);
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
    showStatus("Credential saved.");
  }

  function credentialTitle(): string {
    switch (credentialField) {
      case "GEMINI_API_KEY":
        return "Enter Gemini API Key";
      case "ANTHROPIC_API_KEY":
        return "Enter Anthropic API Key";
      case "DEEPSEEK_API_KEY":
        return "Enter DeepSeek API Key";
      case "OPENROUTER_API_KEY":
        return "Enter OpenRouter API Key";
      case "GITHUB_TOKEN":
        return "Enter GitHub Token";
      default:
        return "Enter value";
    }
  }

  return {
    handleSettingsSelect,
    handleProviderSelect,
    handleModelSelect,
    handleCredentialSubmit,
    credentialTitle,
  };
}
