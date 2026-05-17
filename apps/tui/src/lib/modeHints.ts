interface ChatModeHintInput {
  chatMode: "input" | "subagent-picker" | "subagent-detail" | "tool-focus" | "tool-detail";
  isLoading: boolean;
  hasPending: boolean;
  activePanelId?: string | null;
  subAgentCount: number;
  toolCount?: number;
}

export function getChatModeHint({
  chatMode,
  isLoading,
  hasPending,
  activePanelId,
  subAgentCount,
  toolCount = 0,
}: ChatModeHintInput): string {
  const sep = " | ";
  if (hasPending) return `y accept${sep}a accept all${sep}n deny${sep}↑↓ scroll diff${sep}Tab hunks${sep}Esc cancel`;
  if (activePanelId) return `Up/Down select${sep}Enter open${sep}Esc close`;
  if (chatMode === "subagent-picker") return `Enter view detail${sep}↑↓ navigate${sep}Esc close`;
  if (chatMode === "subagent-detail") return `Esc back to list${sep}Ctrl+O close`;
  if (chatMode === "tool-focus") return `Enter expand/collapse${sep}d detail${sep}Up/Down tools${sep}Ctrl+T/Esc back`;
  if (chatMode === "tool-detail") return `Esc back to tools${sep}Ctrl+T close`;
  if (isLoading) return "Esc cancel" + (subAgentCount > 0 ? `${sep}Ctrl+O sub-agent detail` : "");
  return `Enter send${sep}/ commands`
    + (subAgentCount > 0 ? `${sep}Ctrl+O sub-agent detail` : "")
    + (toolCount > 0 ? `${sep}Ctrl+T tools` : "")
    + `${sep}Ctrl+K command palette`;
}
