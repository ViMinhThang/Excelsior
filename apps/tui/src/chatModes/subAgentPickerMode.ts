import { ownsModalInput } from "../lib/inputOwnership.js";
import { modeHint, sep } from "./hints.js";
import { renderConversation } from "./conversationView.js";
import type { ChatModeDefinition } from "./types.js";

export const subAgentPickerMode: ChatModeDefinition<"subagent-picker"> = {
  render: (ctx) => renderConversation(ctx, { showSubAgentPicker: true }),
  getHint: (ctx) => {
    return modeHint(
      ctx,
      `Enter view detail${sep}\u2191\u2193 navigate${sep}Esc close`,
    );
  },
  getKeymaps: (ctx) => [{
    map: {
      up: () => ctx.prevSubAgent(),
      down: () => ctx.nextSubAgent(),
      return: () => ctx.setChatMode("subagent-detail"),
      "ctrl+o": () => ctx.toggleToolsExpanded(),
      escape: () => ctx.setChatMode("input"),
    },
    enabled: ownsModalInput(ctx.isPaletteOpen),
    priority: 80,
  }],
};
