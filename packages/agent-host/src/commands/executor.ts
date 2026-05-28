import type { CommandDefinition, CommandResult } from "@excelsior/core";
import { createCoreCommands } from "./coreCommands.js";
import { formatHelpText } from "./helpCommand.js";
import { createModeCommand } from "./modeCommands.js";
import { createReviewCommands } from "./reviewCommands.js";
import { createRevertCommand } from "./revertCommand.js";
import { createSessionCommand } from "./sessionCommands.js";
import { createSettingsCommand } from "./settingsCommands.js";
import type { AgentCommand, AgentCommandApplication, ReviewCommandServices } from "./types.js";

export interface AgentCommandExecutorOptions {
  application: AgentCommandApplication;
  services?: ReviewCommandServices;
}

interface ParsedCommandInput {
  name: string;
  args: string[];
}

export class AgentCommandExecutor {
  private readonly application: AgentCommandApplication;
  private readonly commands: AgentCommand[];

  constructor(options: AgentCommandExecutorOptions) {
    this.application = options.application;
    this.commands = createAgentCommands(options.services);
  }

  getDefinitions(): CommandDefinition[] {
    return this.commands.map((c) => c.definition);
  }

  getHelpText(): string {
    return formatHelpText(this.getDefinitions());
  }

  async execute(input: string): Promise<CommandResult> {
    const parsed = parseCommandInput(input);
    if (!parsed) return { handled: false };

    const command = this.commands.find((c) => c.definition.name === parsed.name);
    if (!command) {
      return {
        handled: true,
        message: `Unknown command: /${parsed.name}. Type /help for a list of commands.`,
        clearInput: true,
      };
    }

    return command.execute(parsed.args, this.application);
  }
}

function createAgentCommands(
  services?: ReviewCommandServices,
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

function parseCommandInput(input: string): ParsedCommandInput | null {
  if (!input.startsWith("/")) return null;

  const commandText = input.slice(1).trimStart();
  const firstWhitespace = commandText.search(/\s/);
  const name =
    firstWhitespace === -1
      ? commandText.toLowerCase()
      : commandText.slice(0, firstWhitespace).toLowerCase();
  const argText =
    firstWhitespace === -1 ? "" : commandText.slice(firstWhitespace).trim();
  const args = argText ? argText.split(/\s+/) : [];

  return { name, args };
}
