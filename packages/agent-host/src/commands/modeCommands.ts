import { formatAgentMode } from "@excelsior/core";
import type { AgentCommand } from "./types.js";
import { CommandBuilder } from "./commandBuilder.js";

export function createModeCommand(): AgentCommand {
  return new CommandBuilder("mode")
    .category("mode")
    .description("Show or switch Plan/Act mode")
    .default((_args, application) => ({
      handled: true,
      message: `Current mode: ${formatAgentMode(application.getSnapshot().mode)}. Usage: /mode plan | /mode act`,
      clearInput: true,
    }))
    .subCommand("plan", "", (_args, application) => {
      application.setMode("plan");
      return {
        handled: true,
        message: `Mode switched to ${formatAgentMode("plan")}.`,
        clearInput: true,
      };
    })
    .subCommand("act", "", (_args, application) => {
      application.setMode("act");
      return {
        handled: true,
        message: `Mode switched to ${formatAgentMode("act")}.`,
        clearInput: true,
      };
    })
    .build();
}
