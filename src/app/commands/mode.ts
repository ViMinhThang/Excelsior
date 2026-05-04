import type { CommandDefinition } from "../commands.js";
import type { ReviewMode } from "../../review/types.js";

export const modeCommand: CommandDefinition<{ mode: ReviewMode }> = {
  name: "mode",
  syntax: "/mode <PLAN|ACT>",
  description: "Switch active review mode",
  parse: (args) => {
    const trimmed = args.trim().toUpperCase();
    if (trimmed === "PLAN") return { mode: "PLAN" };
    if (trimmed === "ACT") return { mode: "ACT" };
    return null;
  },
  execute: async (args, { ui }) => {
    ui.setMode(args.mode);
    ui.notify(`Mode switched to ${args.mode}`, "success");
  },
};
