import type { CommandDefinition } from "../commands.js";

export const providerCommand: CommandDefinition = {
  name: "provider",
  syntax: "/provider",
  description: "Select an AI provider from the catalog",
  parse: (args) => (args.trim() === "" ? {} : null),
  execute: async (_args, { ui }) => {
    ui.setView("PROVIDER_SELECT");
  },
};
