import { Box, Text } from "ink";
import { toSubAgentViewModel } from "@excelsior/core";
import SubAgentDetail from "../features/review/components/SubAgentDetail.js";
import { theme } from "../theme.js";
import { modeHint } from "./hints.js";
import { modalKeymap } from "./modalKeymaps.js";
import { subAgentSelection } from "./selection.js";
import type { ChatModeDefinition } from "./types.js";

export const subAgentDetailMode: ChatModeDefinition<"subagent-detail"> = {
  render: (ctx) => {
    const selectedSubAgent = ctx.subAgents.blocks[ctx.subAgents.selectedIndex];
    if (!selectedSubAgent) {
      return (
        <Box marginTop={1} paddingLeft={1}>
          <Text color={theme.colors.muted}>No sub-agent detail is available yet.</Text>
        </Box>
      );
    }

    return (
      <SubAgentDetail
        agent={toSubAgentViewModel(
          selectedSubAgent.state,
          selectedSubAgent.id,
          selectedSubAgent.role,
        )}
        showToolCalls={ctx.commandsExpanded}
      />
    );
  },
  getHint: (ctx) => {
    return modeHint(
      ctx,
      "Esc back to list",
    );
  },
  getSelection: subAgentSelection,
  getKeymaps: (ctx) => modalKeymap(ctx.isPaletteOpen, {
    escape: () => ctx.setChatMode("subagent-picker"),
    "ctrl+o": () => ctx.toggleCommandsExpanded(),
  }),
};
