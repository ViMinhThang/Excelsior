import type { CommandResult } from "@excelsior/core";
import { formatAgentMode } from "@excelsior/core";
import type { AgentCommand, AgentCommandApplication } from "./types.js";

export function createModeCommand(): AgentCommand {
  return {
    definition: {
      name: "mode",
      category: "mode",
      description: "Show or switch Plan/Act mode",
      usage: "/mode | /mode plan | /mode act",
    },
    execute: executeModeCommand,
  };
}

function executeModeCommand(args: string[], application: AgentCommandApplication): CommandResult {
  const next = args[0]?.toLowerCase();
  if (!next) {
    return {
      handled: true,
      message: `Current mode: ${formatAgentMode(application.getSnapshot().mode)}. Usage: /mode plan | /mode act`,
      clearInput: true,
    };
  }

  if (next !== "plan" && next !== "act") {
    return {
      handled: true,
      message: "Usage: /mode | /mode plan | /mode act",
      clearInput: true,
    };
  }

  application.setMode(next);
  return {
    handled: true,
    message: `Mode switched to ${formatAgentMode(next)}.`,
    clearInput: true,
  };
}
