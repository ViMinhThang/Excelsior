import type { FC } from "react";
import { theme } from "../../theme.js";
import { chatModeRegistry } from "../../chatModes/registry.js";
import type { ChatMode } from "../../chatModes/types.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

export interface FooterBarProps {
  chatMode: ChatMode;
  isLoading: boolean;
  hasPending: boolean;
  pendingKind?: "confirmation" | "question" | null;
  activePanelId: string | null;
  subAgentCount: number;
  toolCallCount: number;
  toolsExpanded: boolean;
  totalTokens?: number;
}

const FooterBar: FC<FooterBarProps> = ({
  chatMode,
  isLoading,
  hasPending,
  pendingKind,
  activePanelId,
  subAgentCount,
  toolCallCount,
  toolsExpanded,
  totalTokens,
}) => {
  const footerHint = chatModeRegistry[chatMode].getHint({
    chatMode,
    isLoading,
    hasPending,
    pendingKind,
    activePanelId,
    subAgentCount,
    toolCallCount,
    toolsExpanded,
  });

  return (
    <box flexDirection="row" width="100%">
      <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })} truncate>
        {footerHint}
      </text>
      {totalTokens !== undefined && (
        <>
          <text fg={theme.colors.border}> </text>
          <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
            | {(totalTokens / 1000).toFixed(1)} tok |
          </text>
        </>
      )}
    </box>
  );
};

export default FooterBar;
