import type { AppSettings } from "@excelsior/core";
import type { SettingsStore } from "../ports/SettingsStore.js";
import { DefaultSettingsStore } from "../ports/DefaultSettingsStore.js";

export class HostSettingsService {
  private readonly store: SettingsStore;

  constructor(store?: SettingsStore) {
    this.store = store ?? new DefaultSettingsStore();
  }

  getSettings(): AppSettings {
    return {
      deepseekApiKey: this.store.get("DEEPSEEK_API_KEY") || "",
      githubToken: this.store.get("GITHUB_TOKEN") || "",
    };
  }

  saveSettings(settings: Partial<AppSettings>): void {
    if (settings.deepseekApiKey !== undefined) {
      this.store.set("DEEPSEEK_API_KEY", settings.deepseekApiKey);
    }
    if (settings.githubToken !== undefined) {
      this.store.set("GITHUB_TOKEN", settings.githubToken);
    }
  }
}
