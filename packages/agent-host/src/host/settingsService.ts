import type { AppSettings } from "@excelsior/core";
import { getSetting, setSetting } from "../lib/persistence/db.js";

export class HostSettingsService {
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
