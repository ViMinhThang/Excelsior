import type {
  ChatModeSelection,
  ChatModeSelectionContextMap,
} from "./types.js";

export function emptySelection(): ChatModeSelection {
  return {
    selectedSubAgentId: null,
  };
}

export function subAgentSelection(
  ctx: ChatModeSelectionContextMap["subagent-picker"],
): ChatModeSelection {
  return {
    selectedSubAgentId: ctx.subAgents[ctx.subAgentIndex]?.id ?? null,
  };
}
