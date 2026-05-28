import type { AgentCommand } from "./types.js";

export function createRevertCommand(): AgentCommand {
  return {
    definition: {
      name: "revert",
      category: "core",
      description: "Revert the latest turn's write/edit file changes",
      usage: "/revert",
    },
    execute: (_args, application) => application.revertLastTurn(),
  };
}
