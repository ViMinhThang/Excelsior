import type { CommandDefinition } from "@excelsior/core";
import type { AgentCommand } from "./types.js";

const HELP_GROUPS = [
  {
    title: "Core",
    category: "core",
  },
  {
    title: "Mode",
    category: "mode",
  },
  {
    title: "Settings",
    category: "settings",
  },
  {
    title: "Session",
    category: "session",
  },
  {
    title: "Review",
    category: "review",
  },
  {
    title: "Skills",
    category: "skills",
  },
];

export function formatHelpText(commands: CommandDefinition[]): string {
  const body = HELP_GROUPS
    .map((group) => {
      const entries = commands
        .filter((command) => command.category === group.category)
        .map((command) => {
          const usage = command.usage ? `\n  usage: ${command.usage}` : "";
          return `/${command.name} - ${command.description}${usage}`;
        })
        .join("\n");
      if (!entries) return "";
      return `${group.title}\n${entries}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return `Available commands:\n\n${body}`;
}

export function createHelpCommand(getDefinitions: () => CommandDefinition[]): AgentCommand {
  return {
    definition: {
      name: "help",
      category: "core",
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
