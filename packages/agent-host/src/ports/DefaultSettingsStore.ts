import type { AppSettings } from "@excelsior/core";
import { getSetting, setSetting } from "../persistence/db.js";
import type { SettingsStore } from "./SettingsStore.js";

/**
 * Default SettingsStore implementation backed by the SQLite settings table.
 */
export class DefaultSettingsStore implements SettingsStore {
  getSettings(): AppSettings {
    return {
      deepseekApiKey: getSetting("DEEPSEEK_API_KEY") || "",
      githubToken: getSetting("GITHUB_TOKEN") || "",
    };
  }

  saveSettings(settings: Partial<AppSettings>): void {
    if (settings.deepseekApiKey !== undefined) {
      setSetting("DEEPSEEK_API_KEY", settings.deepseekApiKey);
    }
    if (settings.githubToken !== undefined) {
      setSetting("GITHUB_TOKEN", settings.githubToken);
    }
  }
}

