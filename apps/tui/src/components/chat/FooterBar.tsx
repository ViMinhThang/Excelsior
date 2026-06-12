import type { FC } from "react";
import type { ReflectionClientState } from "@excelsior/core";
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
  reflection?: ReflectionClientState;
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
  reflection,
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
  const reflectionHint = getReflectionHint(reflection);
  const displayHint = reflectionHint ? `${footerHint} | ${reflectionHint}` : footerHint;

  return (
    <box flexDirection="row" width="100%">
      <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })} truncate>
        {displayHint}
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

function getReflectionHint(reflection?: ReflectionClientState): string | null {
  if (!reflection) return null;
  if (reflection.status === "running") return "reflecting | /reflect stop";
  if (reflection.status === "failed") return "reflection failed";
  return null;
}
