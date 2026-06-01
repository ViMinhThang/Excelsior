import type { CommandDefinition, CommandResult } from "@excelsior/core";
import { createCoreCommands } from "./coreCommands.js";
import { formatHelpText } from "./helpCommand.js";
import { createRevertCommand } from "./revertCommand.js";
import { createModeCommand } from "./modeCommands.js";
import { createSettingsCommand } from "./settingsCommands.js";
import { createSessionCommand } from "./sessionCommands.js";
import { createCompactCommand } from "./compactCommand.js";
import { createReviewCommands } from "./reviewCommands.js";
import type { AgentCommand, AgentCommandApplication, ReviewCommandServices } from "./types.js";
import { SkillCatalog } from "../agent/skills/SkillCatalog.js";
import { CommandBuilder } from "./commandBuilder.js";

export interface CommandRegistryOptions {
  application: AgentCommandApplication;
  services?: ReviewCommandServices;
  workspaceRoot?: string;
}

export class CommandRegistry {
  private readonly commands = new Map<string, AgentCommand>();
  private readonly application: AgentCommandApplication;

  constructor(options: CommandRegistryOptions) {
    this.application = options.application;
    this.initialize(options.services, options.workspaceRoot);
  }

  private initialize(services?: ReviewCommandServices, workspaceRoot?: string): void {
    const baseCommands = [
      ...createCoreCommands(() => this.getDefinitions()),
      createRevertCommand(),
      createModeCommand(),
      createSettingsCommand(),
      createSessionCommand(),
      createCompactCommand(),
      ...createReviewCommands(services),
    ];

    for (const cmd of baseCommands) {
      this.register(cmd);
    }

    if (workspaceRoot) {
      const skillCatalog = SkillCatalog.discover(workspaceRoot);
      for (const { skill, commandName } of skillCatalog.getEntries()) {
        const skillCommand = new CommandBuilder(commandName)
          .category("skills")
          .description(skill.shortDescription)
          .default(async (_args, application) => {
            const body = skillCatalog.getSkillBody(skill.name);
            if (!body) {
              return {
                handled: true,
                message: `Skill ${skill.name} not found or disabled.`,
                clearInput: true,
              };
            }
            application.send(body, { displayContent: `Running skill: ${skill.name}` });
            return {
              handled: true,
              message: `Starting skill: ${skill.name}...`,
              clearInput: true,
            };
          })
          .build();
        
        this.register(skillCommand);
      }
    }
  }

  register(command: AgentCommand): void {
    this.commands.set(command.definition.name.toLowerCase(), command);
  }

  getDefinitions(): CommandDefinition[] {
    return Array.from(this.commands.values()).map((c) => c.definition);
  }

  getHelpText(): string {
    return formatHelpText(this.getDefinitions());
  }

  async execute(input: string): Promise<CommandResult> {
    const parsed = parseCommandInput(input);
    if (!parsed) return { handled: false };

    const command = this.commands.get(parsed.name);
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

interface ParsedCommandInput {
  name: string;
  args: string[];
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
