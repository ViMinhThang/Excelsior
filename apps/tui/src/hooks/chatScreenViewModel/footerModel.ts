import type { FooterBarProps } from "../../components/chat/FooterBar.js";
import type { ChatMode } from "../../chatModes/types.js";

export function buildFooterModel(input: {
  chatMode: ChatMode;
  isLoading: boolean;
  pending: unknown;
  pendingKind?: "confirmation" | "question" | null;
  activePanelId: string | null;
  subAgentCount: number;
  toolCallCount: number;
  toolsExpanded: boolean;
  totalTokens?: number;
}): FooterBarProps {
  const footer: FooterBarProps = {
    chatMode: input.chatMode,
    isLoading: input.isLoading,
    hasPending: !!input.pending,
    activePanelId: input.activePanelId,
    subAgentCount: input.subAgentCount,
    toolCallCount: input.toolCallCount,
    toolsExpanded: input.toolsExpanded,
    totalTokens: input.totalTokens,
  };
  if (input.pendingKind) footer.pendingKind = input.pendingKind;
  return footer;
}
