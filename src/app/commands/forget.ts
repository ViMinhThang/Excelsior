import type { CommandDefinition } from "../commands.js";

export const forgetCommand: CommandDefinition = {
  name: "forget",
  syntax: "/forget",
  description: "Reset session memory (coming soon)",
  parse: (input) => (input.trim() === "/forget" ? {} : null),
  execute: async (_args, ctx) => {
    ctx.setChatResponse("Memory reset coming soon.");
  },
};
