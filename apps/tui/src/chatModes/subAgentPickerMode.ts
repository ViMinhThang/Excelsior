import { modeHint, sep } from "./hints.js";
import { modalKeymap } from "./modalKeymaps.js";
import { renderConversation } from "./conversationView.js";
import { subAgentSelection } from "./selection.js";
import type { ChatModeDefinition } from "./types.js";

export const subAgentPickerMode: ChatModeDefinition<"subagent-picker"> = {
  render: (ctx) => renderConversation(ctx, { showSubAgentPicker: true }),
  getHint: (ctx) => {
    return modeHint(
      ctx,
      `Enter view detail${sep}\u2191\u2193 navigate${sep}Esc close`,
    );
  },
  getSelection: subAgentSelection,
  getKeymaps: (ctx) => modalKeymap(ctx.isPaletteOpen, {
    up: () => ctx.prevSubAgent(),
    down: () => ctx.nextSubAgent(),
    return: () => ctx.setChatMode("subagent-detail"),
    "ctrl+o": () => ctx.toggleCommandsExpanded(),
    escape: () => ctx.setChatMode("input"),
  }),
};
