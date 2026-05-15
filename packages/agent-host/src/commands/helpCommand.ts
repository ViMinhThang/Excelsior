import type { CommandDefinition } from "@excelsior/core";
import type { AgentCommand } from "./types.js";

const HELP_GROUPS = [
  {
    title: "Core",
    names: ["help", "clear", "reset"],
  },
  {
    title: "Mode",
    names: ["mode"],
  },
  {
    title: "Settings",
    names: ["settings"],
  },
  {
    title: "Session",
    names: ["session"],
  },
  {
    title: "Review",
    names: ["review", "review-post"],
  },
];

export function formatHelpText(commands: CommandDefinition[]): string {
  const body = HELP_GROUPS
    .map((group) => {
      const entries = commands
        .filter((command) => group.names.includes(command.name))
        .map((command) => {
          const usage = command.usage ? `\n  usage: ${command.usage}` : "";
          return `/${command.name} - ${command.description}${usage}`;
        })
        .join("\n");
      return `${group.title}\n${entries}`;
    })
    .join("\n\n");

  return `Available commands:\n\n${body}`;
}

export function createHelpCommand(getDefinitions: () => CommandDefinition[]): AgentCommand {
  return {
    definition: {
      name: "help",
      description: "List all available commands",
      usage: "/help",
    },
    execute: () => ({
      handled: true,
      message: formatHelpText(getDefinitions()),
      clearInput: true,
    }),
  };
}
