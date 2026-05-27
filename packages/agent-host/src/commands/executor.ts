import type { CommandDefinition, CommandResult } from "@excelsior/core";
import { createAgentCommands, getHelpText } from "./registry.js";
import { parseCommandInput } from "./parser.js";
import type { AgentCommand, AgentCommandHost, ReviewCommandServices } from "./types.js";

export interface AgentCommandExecutorOptions {
  host: AgentCommandHost;
  services?: ReviewCommandServices;
}

export class AgentCommandExecutor {
  private readonly host: AgentCommandHost;
  private readonly commands: AgentCommand[];

  constructor(options: AgentCommandExecutorOptions) {
    this.host = options.host;
    this.commands = createAgentCommands(options.services);
  }

  getDefinitions(): CommandDefinition[] {
    return this.commands.map((c) => c.definition);
  }

  getHelpText(): string {
    return getHelpText(this.getDefinitions());
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

    return command.execute(parsed.args, this.host);
  }
}
