import { FC, useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../../theme.js";
import { getChatModeHint } from "../../chatModes/registry.js";
import type { ChatMode } from "../../chatModes/types.js";

export interface FooterBarProps {
  chatMode: ChatMode;
  isLoading: boolean;
  hasPending: boolean;
  pendingKind?: "confirmation" | "question" | null;
  activePanelId: string | null;
  subAgentCount: number;
  commandCount: number;
  commandsExpanded: boolean;
  workspaceRootPath: string;
  totalTokens?: number;
}

const FooterBar: FC<FooterBarProps> = ({
  chatMode,
  isLoading,
  hasPending,
  pendingKind,
  activePanelId,
  subAgentCount,
  commandCount,
  commandsExpanded,
  workspaceRootPath,
  totalTokens,
}) => {
  const [extraTokens, setExtraTokens] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setExtraTokens(0);
      return;
    }
    const interval = setInterval(() => {
      setExtraTokens((prev) => prev + 300);
    }, 500);
    return () => clearInterval(interval);
  }, [isLoading]);

  const displayedTokens = (totalTokens ?? 0) + extraTokens;

  const footerHint = getChatModeHint({
    chatMode,
    isLoading,
    hasPending,
    pendingKind,
    activePanelId,
    subAgentCount,
    commandCount,
    commandsExpanded,
  });

  return (
    <Box marginTop={1} paddingLeft={1} flexDirection="row">
      <Text color={theme.colors.muted} dimColor wrap="truncate-end">
        {footerHint}
      </Text>
      {totalTokens !== undefined && (
        <>
          <Text color={theme.colors.border}> </Text>
          <Text color={theme.colors.muted} dimColor>
            | {(displayedTokens / 1000).toFixed(1)} tok |
          </Text>
        </>
      )}
      <Text color={theme.colors.border}>{theme.glyphs.separator}</Text>
      <Text color={theme.colors.muted} dimColor wrap="truncate-start">
        {workspaceRootPath}
      </Text>
    </Box>
  );
};

export default FooterBar;
