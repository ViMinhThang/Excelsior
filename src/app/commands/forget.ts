import type { CommandDefinition } from "../commands.js";

export const forgetCommand: CommandDefinition = {
  name: "forget",
  syntax: "/forget",
  description: "Reset session memory (coming soon)",
  parse: (args) => (args.trim() === "" ? {} : null),
  execute: async (_args, { ui }) => {
    ui.notify("Memory reset coming soon.", "info");
  },
};
