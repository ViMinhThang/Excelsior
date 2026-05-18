import type { FC } from "react";
import { Box, Text } from "ink";
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
  workspaceRootPath: string;
}

const FooterBar: FC<FooterBarProps> = ({
  chatMode,
  isLoading,
  hasPending,
  activePanelId,
  subAgentCount,
  toolCount,
  workspaceRootPath,
}) => {
  const footerHint = getChatModeHint({ chatMode, isLoading, hasPending, activePanelId, subAgentCount, toolCount });
  const footerText = `${footerHint} | workspace: ${workspaceRootPath}`;

  return (
    <Box marginTop={1} paddingLeft={1}>
      <Text color={theme.colors.muted} dimColor wrap="truncate-end">
        {footerText}
      </Text>
    </Box>
  );
};

export default FooterBar;
