import type { AgentCommand } from "./types.js";

export function createSettingsCommand(): AgentCommand {
  return {
    definition: {
      name: "settings",
      description: "View or set configuration settings (e.g. apiKey, githubToken)",
      usage: "/settings",
    },
    execute: () => ({ handled: true, navigate: "settings", clearInput: true }),
  };
}
