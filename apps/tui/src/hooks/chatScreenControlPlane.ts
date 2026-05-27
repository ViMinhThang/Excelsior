import type {
  AgentMode,
  AskQuestionRequest,
  ConfirmRequest,
  ProjectedBlock,
} from "@excelsior/core";
import {
  buildChatModeKeymapContext,
  type ChatMode,
  type ChatModeKeymapContext,
  type CommandSuggestionState,
  type InputModeKeymapContext,
  type SubAgentBlock,
} from "../chatModes/index.js";
import type { FooterBarProps } from "../components/chat/FooterBar.js";
import { buildFooterModel } from "./chatScreenModelBuilders.js";

export type ChatPendingKind = "confirmation" | "question" | null;

export interface ChatPendingState {
  pending: ConfirmRequest | AskQuestionRequest | null;
  pendingKind: ChatPendingKind;
}

export interface BuildChatControlPlaneInput {
  displayBlocks: ProjectedBlock[];
  chatMode: ChatMode;
  isLoading: boolean;
  pendingConfirmation: ConfirmRequest | null;
  pendingQuestion: AskQuestionRequest | null;
  activePanelId: string | null;
  isPaletteOpen: boolean;
  suggestion: CommandSuggestionState;
  setInput: (value: string) => void;
  cancel: () => void;
  toggleMode: () => AgentMode | undefined;
  openSubAgent: () => void;
  subAgentBlocks: SubAgentBlock[];
  commandsExpanded: boolean;
  toggleCommandsExpanded: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  openPalette?: () => void;
  setChatMode: (mode: ChatMode) => void;
  nextSubAgent: () => void;
  prevSubAgent: () => void;
  workspaceRootPath: string;
}

export interface ChatControlPlane {
  pending: ChatPendingState["pending"];
  pendingKind: ChatPendingKind;
  commandCount: number;
  inputModeKeymap: InputModeKeymapContext;
  chatModeKeymap: ChatModeKeymapContext;
  footer: FooterBarProps;
}

export function getChatPendingState(input: {
  pendingConfirmation: ConfirmRequest | null;
  pendingQuestion: AskQuestionRequest | null;
}): ChatPendingState {
  return {
    pending: input.pendingConfirmation ?? input.pendingQuestion,
    pendingKind: input.pendingQuestion
      ? "question"
      : input.pendingConfirmation
        ? "confirmation"
        : null,
  };
}

export function countVisibleCommands(blocks: ProjectedBlock[]): number {
  return blocks.reduce((count, block) => {
    if (block.type === "tool-call") return count + 1;
    if (block.type === "sub-agent") return count + block.state.toolCalls.length;
    return count;
  }, 0);
}

export function shouldResetChatModeForPending(pending: unknown): boolean {
  return Boolean(pending);
}

export function shouldCollapseCommandsForChatMode(chatMode: ChatMode): boolean {
  return chatMode === "input";
}

export function buildChatControlPlane(
  input: BuildChatControlPlaneInput,
): ChatControlPlane {
  const { pending, pendingKind } = getChatPendingState({
    pendingConfirmation: input.pendingConfirmation,
    pendingQuestion: input.pendingQuestion,
  });
  const commandCount = countVisibleCommands(input.displayBlocks);

  const inputModeKeymap: InputModeKeymapContext = {
    chatMode: "input",
    pending,
    activePanelId: input.activePanelId,
    isPaletteOpen: input.isPaletteOpen,
    isLoading: input.isLoading,
    suggestion: input.suggestion,
    setInput: input.setInput,
    cancel: input.cancel,
    toggleMode: input.toggleMode,
    openSubAgent: input.openSubAgent,
    subAgentCount: input.subAgentBlocks.length,
    commandCount,
    commandsExpanded: input.commandsExpanded,
    toggleCommandsExpanded: input.toggleCommandsExpanded,
    navigateUp: input.navigateUp,
    navigateDown: input.navigateDown,
    openPalette: input.openPalette,
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
    commandCount,
    inputModeKeymap,
    chatModeKeymap,
    footer: buildFooterModel({
      chatMode: input.chatMode,
      isLoading: input.isLoading,
      pending,
      pendingKind,
      activePanelId: input.activePanelId,
      subAgentCount: input.subAgentBlocks.length,
      commandCount,
      commandsExpanded: input.commandsExpanded,
      workspaceRootPath: input.workspaceRootPath,
    }),
  };
}
