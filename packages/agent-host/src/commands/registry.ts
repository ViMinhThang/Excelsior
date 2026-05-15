import type { CommandDefinition, CommandResult } from "@excelsior/core";
import { createCoreCommands } from "./coreCommands.js";
import { formatHelpText } from "./helpCommand.js";
import { createModeCommand } from "./modeCommands.js";
import { createReviewCommands, defaultReviewCommandServices } from "./reviewCommands.js";
import { createSessionCommand } from "./sessionCommands.js";
import { createSettingsCommand } from "./settingsCommands.js";
import type { AgentCommand, AgentCommandHost, ReviewCommandServices } from "./types.js";

export function createAgentCommands(
  services: ReviewCommandServices = defaultReviewCommandServices,
): AgentCommand[] {
  let commands: AgentCommand[] = [];
  commands = [
    ...createCoreCommands(() => commands.map((command) => command.definition)),
    createModeCommand(),
    createSettingsCommand(),
    createSessionCommand(),
    ...createReviewCommands(services),
  ];
  return commands;
}

export const commandRegistry = createAgentCommands();
export const commandDefinitions: CommandDefinition[] = commandRegistry.map(
  (command) => command.definition,
);

export function getHelpText(
  commands: CommandDefinition[] = commandDefinitions,
): string {
  return formatHelpText(commands);
}

export async function executeAgentCommand(
  input: string,
  host: AgentCommandHost,
  commands: AgentCommand[] = commandRegistry,
): Promise<CommandResult> {
  if (!input.startsWith("/")) return { handled: false };

  const parts = input.slice(1).split(" ");
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);
  const command = commands.find((candidate) => candidate.definition.name === commandName);

  if (!command) {
    return {
      handled: true,
      message: `Unknown command: /${commandName}. Type /help for a list of commands.`,
      clearInput: true,
    };
  }

  return command.execute(args, host);
}
