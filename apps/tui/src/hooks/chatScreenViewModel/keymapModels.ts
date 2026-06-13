import type { ProjectedTurn } from "@excelsior/core";
import type { ChatModeKeymapContext, InputModeKeymapContext } from "../../chatModes/types.js";
import { buildFooterModel } from "./footerModel.js";
import { getChatPendingState } from "./pendingModels.js";
import type {
  BuildChatInteractionStateInput,
  BuildChatModeKeymapContextInput,
  ChatInteractionState,
} from "./types.js";

export function countToolCalls(turns: ProjectedTurn[]): number {
  return turns.flatMap((t) => t.blocks).reduce((count, block) => {
    if (block.type === "tool-call") return count + 1;
    if (block.type === "sub-agent") return count + block.state.toolCalls.length;
    return count;
  }, 0);
}

export function buildChatModeKeymapContext(
  input: BuildChatModeKeymapContextInput,
): ChatModeKeymapContext {
  switch (input.chatMode) {
    case "input":
      return {
        chatMode: "input",
        pending: input.pending,
        activePanelId: input.activePanelId,
        isPaletteOpen: input.isPaletteOpen,
        isLoading: input.isLoading,
        suggestion: input.suggestion,
        setInput: input.setInput,
        submit: input.submit,
        cancel: input.cancel,
        toggleMode: input.toggleMode,
        openSubAgent: input.openSubAgent,
        subAgentCount: input.subAgentCount,
        toolCallCount: input.toolCallCount,
        toolsExpanded: input.toolsExpanded,
        toggleToolsExpanded: input.toggleToolsExpanded,
        navigateUp: input.navigateUp,
        navigateDown: input.navigateDown,
      };
    case "subagent-picker":
      return {
        chatMode: "subagent-picker",
        isPaletteOpen: input.isPaletteOpen,
        setChatMode: input.setChatMode,
        nextSubAgent: input.nextSubAgent,
        prevSubAgent: input.prevSubAgent,
        toolsExpanded: input.toolsExpanded,
        toggleToolsExpanded: input.toggleToolsExpanded,
      };
    case "subagent-detail":
      return {
        chatMode: "subagent-detail",
        isPaletteOpen: input.isPaletteOpen,
        setChatMode: input.setChatMode,
        toggleToolsExpanded: input.toggleToolsExpanded,
      };
  }
}

export function buildChatInteractionState(
  input: BuildChatInteractionStateInput,
): ChatInteractionState {
  const { pending, pendingKind } = getChatPendingState({
    pendingConfirmation: input.pendingConfirmation,
    pendingQuestion: input.pendingQuestion,
  });
  const toolCallCount = countToolCalls(input.turns);

  const inputModeKeymap: InputModeKeymapContext = {
    chatMode: "input",
    pending,
    activePanelId: input.activePanelId,
    isPaletteOpen: input.isPaletteOpen,
    isLoading: input.isLoading,
    suggestion: input.suggestion,
    setInput: input.setInput,
    submit: input.submit,
    cancel: input.cancel,
    toggleMode: input.toggleMode,
    openSubAgent: input.openSubAgent,
    subAgentCount: input.subAgentBlocks.length,
    toolCallCount,
    toolsExpanded: input.toolsExpanded,
    toggleToolsExpanded: input.toggleToolsExpanded,
    navigateUp: input.navigateUp,
    navigateDown: input.navigateDown,
  };

  const chatModeKeymap = buildChatModeKeymapContext({
    ...inputModeKeymap,
    chatMode: input.chatMode,
    setChatMode: input.setChatMode,
    nextSubAgent: input.nextSubAgent,
    prevSubAgent: input.prevSubAgent,
  });

  return {
    pending,
    pendingKind,
    toolCallCount,
    inputModeKeymap,
    chatModeKeymap,
    footer: buildFooterModel({
      chatMode: input.chatMode,
      isLoading: input.isLoading,
      pending,
      pendingKind,
      activePanelId: input.activePanelId,
      subAgentCount: input.subAgentBlocks.length,
      toolCallCount,
      toolsExpanded: input.toolsExpanded,
    }),
  };
}
