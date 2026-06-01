import {
  AGENT_TOOL_LOOP_STEPS_SETTING,
  DEFAULT_AGENT_TOOL_LOOP_STEPS,
  normalizeAgentToolLoopSteps,
  type AppSettings,
} from "@excelsior/core";
import { getSetting, setSetting } from "./db.js";

/**
 * SettingsStore concrete module backed by the SQLite settings table.
 */
export class SettingsStore {
  getSettings(): AppSettings {
    return {
      deepseekApiKey: getSetting("DEEPSEEK_API_KEY") || "",
      githubToken: getSetting("GITHUB_TOKEN") || "",
      agentToolLoopSteps: normalizeAgentToolLoopSteps(
        getSetting(AGENT_TOOL_LOOP_STEPS_SETTING) ||
          DEFAULT_AGENT_TOOL_LOOP_STEPS,
      ),
    };
  }

  saveSettings(settings: Partial<AppSettings>): void {
    if (settings.deepseekApiKey !== undefined) {
      setSetting("DEEPSEEK_API_KEY", settings.deepseekApiKey);
    }
    if (settings.githubToken !== undefined) {
      setSetting("GITHUB_TOKEN", settings.githubToken);
    }
    if (settings.agentToolLoopSteps !== undefined) {
      setSetting(
        AGENT_TOOL_LOOP_STEPS_SETTING,
        normalizeAgentToolLoopSteps(settings.agentToolLoopSteps),
      );
    }
  }
}
