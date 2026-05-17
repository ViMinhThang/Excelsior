import type { FC } from "react";
import { Box, Text } from "ink";
import { formatAgentMode } from "@excelsior/core";
import type { AgentMode } from "@excelsior/core";
import { theme } from "../../theme.js";
import { getChatModeHint } from "../../lib/modeHints.js";
import type { ChatMode } from "../../hooks/useSubAgentNavigation.js";

interface FooterBarProps {
  chatMode: ChatMode;
  isLoading: boolean;
  hasPending: boolean;
  activePanelId: string | null;
  subAgentCount: number;
  toolCount: number;
  mode: AgentMode;
  workspaceRootPath: string;
}

const FooterBar: FC<FooterBarProps> = ({
  chatMode,
  isLoading,
  hasPending,
  activePanelId,
  subAgentCount,
  toolCount,
  mode,
  workspaceRootPath,
}) => {
  const footerHint = getChatModeHint({ chatMode, isLoading, hasPending, activePanelId, subAgentCount, toolCount });

  return (
    <>
      <Box marginTop={1} paddingLeft={1}>
        <Text color={theme.colors.muted} dimColor>{footerHint}{theme.glyphs.separator}mode: {formatAgentMode(mode)}</Text>
      </Box>
      <Box paddingLeft={1}>
        <Text color={theme.colors.muted} dimColor>workspace: {workspaceRootPath}</Text>
      </Box>
    </>
  );
};

export default FooterBar;
