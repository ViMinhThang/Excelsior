import type { CommandDefinition } from "../commands.js";

export const reviewCommand: CommandDefinition<{ prNumber?: number }> = {
  name: "review",
  syntax: "/review [number]",
  description: "Review a pull request",
  parse: (args) => {
    const trimmed = args.trim();
    if (trimmed === "") return {};
    const num = parseInt(trimmed, 10);
    if (!isNaN(num)) return { prNumber: num };
    return null;
  },
  execute: async (args, ctx) => {
    if (args.prNumber !== undefined) {
      await ctx.runReview(args.prNumber);
    } else {
      await ctx.loadPullRequests();
    }
  },
};
