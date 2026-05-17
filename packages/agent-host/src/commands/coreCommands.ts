import type { CommandDefinition } from "@excelsior/core";
import { createHelpCommand } from "./helpCommand.js";
import type { AgentCommand } from "./types.js";

export function createCoreCommands(
  getDefinitions: () => CommandDefinition[],
): AgentCommand[] {
  return [
    createHelpCommand(getDefinitions),
    {
      definition: {
        name: "clear",
        category: "core",
        description: "Clear chat messages from the screen",
        usage: "/clear",
      },
      execute: (_args, host) => {
        host.clearMessages();
        return {
          handled: true,
          message: "Chat history cleared from UI.",
          clearInput: true,
        };
      },
    },
    {
      definition: {
        name: "reset",
        category: "core",
        description: "Delete all conversation history from database",
        usage: "/reset",
      },
      execute: async (_args, host) => {
        await host.deleteAllSessions();
        host.clearMessages();
        return { handled: true, message: "Database history reset.", clearInput: true };
      },
    },
  ];
}
