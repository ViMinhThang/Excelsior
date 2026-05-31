import type { CommandDefinition, CommandResult } from "@excelsior/core";
import { CommandRegistry } from "./registry.js";
import type { AgentCommandApplication, ReviewCommandServices } from "./types.js";

export interface AgentCommandExecutorOptions {
  application: AgentCommandApplication;
  services?: ReviewCommandServices;
}

export class AgentCommandExecutor {
  private readonly registry: CommandRegistry;

  constructor(options: AgentCommandExecutorOptions) {
    this.registry = new CommandRegistry({
      application: options.application,
      services: options.services,
      workspaceRoot: options.application.workspaceRoot,
    });
  }

  getDefinitions(): CommandDefinition[] {
    return this.registry.getDefinitions();
  }

  getHelpText(): string {
    return this.registry.getHelpText();
  }

  execute(input: string): Promise<CommandResult> {
    return this.registry.execute(input);
  }
}
