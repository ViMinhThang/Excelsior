import type { CommandDefinition } from "../commands.js";

export const settingsCommand: CommandDefinition = {
  name: "settings",
  syntax: "/settings",
  description: "Open configuration settings",
  parse: (args) => (args.trim() === "" ? {} : null),
  execute: async (_args, ctx) => {
    ctx.setView("SETTINGS");
  },
};
