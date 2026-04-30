import type { CommandDefinition } from "../commands.js";

export const reviewCommand: CommandDefinition<{ prNumber?: number }> = {
  name: "review",
  syntax: "/review [number]",
  description: "Review a pull request",
  parse: (input) => {
    const trimmed = input.trim();
    if (trimmed === "/review") return {};
    if (trimmed.startsWith("/review ")) {
      const numStr = trimmed.slice(8).trim();
      const num = parseInt(numStr, 10);
      if (!isNaN(num)) return { prNumber: num };
    }
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
