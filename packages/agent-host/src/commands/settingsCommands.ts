import { CommandBuilder } from "./commandBuilder.js";
import type { AgentCommand } from "./types.js";

export function createSettingsCommand(): AgentCommand {
  return new CommandBuilder("settings")
    .category("settings")
    .description("View or set configuration settings (e.g. apiKey, githubToken)")
    .default(() => ({ handled: true, navigate: "settings", clearInput: true }))
    .build();
}
