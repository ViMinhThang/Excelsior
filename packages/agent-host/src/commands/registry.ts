import type { CommandDefinition, CommandResult } from "@excelsior/core";
import { createCoreCommands } from "./coreCommands.js";
import { formatHelpText } from "./helpCommand.js";
import { createModeCommand } from "./modeCommands.js";
import { createReviewCommands, defaultReviewCommandServices } from "./reviewCommands.js";
import { createRevertCommand } from "./revertCommand.js";
import { createSessionCommand } from "./sessionCommands.js";
import { createSettingsCommand } from "./settingsCommands.js";
import { parseCommandInput } from "./parser.js";
import type { AgentCommand, AgentCommandHost, ReviewCommandServices } from "./types.js";

export function createAgentCommands(
  services: ReviewCommandServices = defaultReviewCommandServices,
): AgentCommand[] {
  let commands: AgentCommand[] = [];
  commands = [
    ...createCoreCommands(() => commands.map((command) => command.definition)),
    createRevertCommand(),
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
  const parsed = parseCommandInput(input);
  if (!parsed) return { handled: false };

  const command = commands.find((candidate) => candidate.definition.name === parsed.name);

  if (!command) {
    return {
      handled: true,
      message: `Unknown command: /${parsed.name}. Type /help for a list of commands.`,
      clearInput: true,
    };
  }

  return command.execute(parsed.args, host);
}
