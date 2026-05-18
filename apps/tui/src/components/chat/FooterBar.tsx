import type { FC } from "react";
import { Box, Text } from "ink";
import { theme } from "../../theme.js";
import { getChatModeHint } from "../../lib/modeHints.js";
import type { ChatMode } from "../../chatModes/index.js";

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

  return (
    <Box marginTop={1} paddingLeft={1} flexDirection="row">
      <Text color={theme.colors.muted} dimColor wrap="truncate-end">
        {footerHint}
      </Text>
      <Text color={theme.colors.border}>{theme.glyphs.separator}</Text>
      <Text color={theme.colors.muted} dimColor wrap="truncate-start">
        {workspaceRootPath}
      </Text>
    </Box>
  );
};

export default FooterBar;
