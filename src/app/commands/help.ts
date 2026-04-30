import type { CommandDefinition } from "../commands.js";

export const helpCommand: CommandDefinition = {
  name: "help",
  syntax: "/help",
  description: "Show available commands",
  parse: (input) => (input.trim() === "/help" ? {} : null),
  execute: async (_args, ctx) => {
    ctx.showStatus(ctx.getHelpText(), 8000);
  },
};
