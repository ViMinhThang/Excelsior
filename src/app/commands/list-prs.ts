import type { CommandDefinition } from "../commands.js";

export const listPrsCommand: CommandDefinition = {
  name: "list-prs",
  syntax: "/pr",
  description: "List open pull requests",
  parse: (input) => (input.trim() === "/pr" ? {} : null),
  execute: async (_args, ctx) => {
    await ctx.loadPullRequests();
  },
};
