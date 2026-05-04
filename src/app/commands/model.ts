import type { CommandDefinition } from "../commands.js";

export const modelCommand: CommandDefinition = {
  name: "model",
  syntax: "/model",
  description: "Select a model with context window and cost info",
  parse: (args) => (args.trim() === "" ? {} : null),
  execute: async (_args, { ui }) => {
    ui.setView("MODEL_SELECT");
  },
};
