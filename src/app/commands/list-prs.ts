import type { CommandDefinition } from "../commands.js";

export const listPrsCommand: CommandDefinition = {
  name: "list-prs",
  syntax: "/pr",
  description: "List open pull requests",
  parse: (args) => (args.trim() === "" ? {} : null),
  execute: async (_args, { actions }) => {
    await actions.loadPullRequests();
  },
};
