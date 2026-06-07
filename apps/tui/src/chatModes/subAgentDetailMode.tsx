import { toSubAgentViewModel } from "@excelsior/core";
import SubAgentDetail from "../components/subAgents/SubAgentDetail.js";
import { theme } from "../theme.js";
import { ownsModalInput } from "../lib/inputOwnership.js";
import { modeHint } from "./hints.js";
import type { ChatModeDefinition } from "./types.js";

export const subAgentDetailMode: ChatModeDefinition<"subagent-detail"> = {
  render: (ctx) => {
    const selectedSubAgent = ctx.subAgents.blocks[ctx.subAgents.selectedIndex];
    if (!selectedSubAgent) {
      return (
        <box marginTop={1} paddingLeft={1}>
          <text fg={theme.colors.muted}>No sub-agent detail is available yet.</text>
        </box>
      );
    }

    return (
      <SubAgentDetail
        agent={toSubAgentViewModel(
          selectedSubAgent.state,
          selectedSubAgent.id,
          selectedSubAgent.role,
        )}
        showToolCalls={ctx.toolsExpanded}
      />
    );
  },
  getHint: (ctx) => {
    return modeHint(
      ctx,
      "Esc back to list",
    );
  },
  getKeymaps: (ctx) => [{
    map: {
      escape: () => ctx.setChatMode("subagent-picker"),
      "ctrl+o": () => ctx.toggleToolsExpanded(),
    },
    enabled: ownsModalInput(ctx.isPaletteOpen),
    priority: 80,
  }],
};