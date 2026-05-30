import type { CommandDefinition } from "@excelsior/core";
import { createHelpCommand } from "./helpCommand.js";
import type { AgentCommand, AgentCommandApplication } from "./types.js";
import { CommandBuilder } from "./commandBuilder.js";

export function createCoreCommands(
  getDefinitions: () => CommandDefinition[],
): AgentCommand[] {
  return [
    createHelpCommand(getDefinitions),
    new CommandBuilder<AgentCommandApplication>("clear")
      .category("core")
      .description("Clear chat messages from the screen")
      .default((_args, application) => {
        application.clear();
        return {
          handled: true,
          message: "Chat history cleared from UI.",
          clearInput: true,
        };
      })
      .build(),
    new CommandBuilder<AgentCommandApplication>("reset")
      .category("core")
      .description("Delete all conversation history from database")
      .default(async (_args, application) => {
        await application.deleteAllSessions();
        application.clear();
        return { handled: true, message: "Database history reset.", clearInput: true };
      })
      .build(),
  ];
}
