import type { CommandDefinition } from "../commands.js";
import type { ReviewMode } from "../../review/types.js";

export const modeCommand: CommandDefinition<{ mode: ReviewMode }> = {
  name: "mode",
  syntax: "/mode <PLAN|ACT>",
  description: "Switch active review mode",
  parse: (input) => {
    const trimmed = input.trim();
    if (trimmed === "/mode PLAN") return { mode: "PLAN" };
    if (trimmed === "/mode ACT") return { mode: "ACT" };
    return null;
  },
  execute: async (args, ctx) => {
    ctx.setMode(args.mode);
    ctx.setChatResponse(`Mode switched to ${args.mode}`);
  },
};
