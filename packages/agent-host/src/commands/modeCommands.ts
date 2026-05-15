import type { CommandResult } from "@excelsior/core";
import { formatAgentMode } from "@excelsior/core";
import type { AgentCommand, AgentCommandHost } from "./types.js";

export function createModeCommand(): AgentCommand {
  return {
    definition: {
      name: "mode",
      description: "Show or switch Plan/Act mode",
      usage: "/mode | /mode plan | /mode act",
    },
    execute: executeModeCommand,
  };
}

function executeModeCommand(args: string[], host: AgentCommandHost): CommandResult {
  const next = args[0]?.toLowerCase();
  if (!next) {
    return {
      handled: true,
      message: `Current mode: ${formatAgentMode(host.getMode())}. Usage: /mode plan | /mode act`,
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

  host.setMode(next);
  return {
    handled: true,
    message: `Mode switched to ${formatAgentMode(next)}.`,
    clearInput: true,
  };
}
