import type { CommandDefinition } from "../commands.js";

export const helpCommand: CommandDefinition = {
  name: "help",
  syntax: "/help",
  description: "Show available commands",
  parse: (args) => (args.trim() === "" ? {} : null),
  execute: async (_args, ctx) => {
    ctx.setChatResponse(ctx.getHelpText());
  },
};
