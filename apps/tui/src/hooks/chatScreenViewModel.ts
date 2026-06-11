import { createToolDisplay } from "@excelsior/core";
import type {
  AgentMode,
  AskQuestionRequest,
  CommandDefinition,
  ConfirmRequest,
  ProjectedTurn,
} from "@excelsior/core";
import type { AppHeaderProps } from "../components/shared/AppHeader.js";
import type { FooterBarProps } from "../components/chat/FooterBar.js";
import type { PendingActionPanelProps } from "../components/chat/PendingActionPanel.js";
import type { PendingQuestionPanelProps } from "../components/chat/PendingQuestionPanel.js";
import type { CommandSuggestionsProps } from "../components/chat/CommandSuggestions.js";
import type { CommandPaletteProps } from "../components/palette/CommandPalette.js";
import type { TuiPanelContext, TuiPanelDefinition } from "../lib/panels.js";
import type {
  ChatMode,
  ChatModeKeymapContext,
  ChatModeRenderContext,
  CommandSuggestionState,
  InputModeKeymapContext,
  SubAgentBlock,
} from "../chatModes/types.js";

export interface VisibilityModel<TProps> {
  visible: boolean;
  props: TProps;
}

export interface ChatScreenViewModel {
  header: AppHeaderProps;
  modeView: ChatModeRenderContext;
  pendingAction: PendingActionPanelProps | null;
  pendingQuestion: PendingQuestionPanelProps | null;
  suggestions: VisibilityModel<CommandSuggestionsProps>;
  palette: VisibilityModel<CommandPaletteProps>;
  footer: FooterBarProps;
}

export type ChatPendingKind = "confirmation" | "question" | null;

export interface ChatPendingState {
  pending: ConfirmRequest | AskQuestionRequest | null;
  pendingKind: ChatPendingKind;
}

export interface BuildChatModeKeymapContextInput {
  chatMode: ChatMode;
  pending: unknown;
  activePanelId: string | null;
  isPaletteOpen: boolean;
  isLoading: boolean;
  suggestion: InputModeKeymapContext["suggestion"];
  setInput: (value: string) => void;
  submit: () => void;
  setChatMode: (mode: ChatMode) => void;
  cancel: () => void;
  toggleMode: () => "plan" | "act" | undefined;
  openSubAgent: () => void;
  subAgentCount: number;
  toolCallCount: number;
  toolsExpanded: boolean;
  toggleToolsExpanded: () => void;
  nextSubAgent: () => void;
  prevSubAgent: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
}

export interface BuildChatInteractionStateInput {
  turns: ProjectedTurn[];
  chatMode: ChatMode;
  isLoading: boolean;
  pendingConfirmation: ConfirmRequest | null;
  pendingQuestion: AskQuestionRequest | null;
  activePanelId: string | null;
  isPaletteOpen: boolean;
  suggestion: CommandSuggestionState;
  setInput: (value: string) => void;
  submit: () => void;
  cancel: () => void;
  toggleMode: () => AgentMode | undefined;
  openSubAgent: () => void;
  subAgentBlocks: SubAgentBlock[];
  toolsExpanded: boolean;
  toggleToolsExpanded: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  setChatMode: (mode: ChatMode) => void;
  nextSubAgent: () => void;
  prevSubAgent: () => void;
}

export interface ChatInteractionState {
  pending: ChatPendingState["pending"];
  pendingKind: ChatPendingKind;
  toolCallCount: number;
  inputModeKeymap: InputModeKeymapContext;
  chatModeKeymap: ChatModeKeymapContext;
  footer: FooterBarProps;
}

export interface BuildModeViewContextInput {
  chatMode: ChatMode;
  turns: ProjectedTurn[];
  inputValue: string;
  setInput: (value: string) => void;
  handleSubmit: () => void;
  shouldSubmit?: (value: string) => boolean;
  isLoading: boolean;
  pending: unknown;
  paletteOpen: boolean;
  commandResult: string | null;
  agentMode: AgentMode;
  activePanel: TuiPanelDefinition | undefined;
  featureContext: TuiPanelContext;
  subAgents: SubAgentBlock[];
  subAgentIndex: number;
  toolsExpanded: boolean;
  viewportKey: string;
}

interface CommandPaletteState {
  isOpen: boolean;
  search: string;
  setSearch: (value: string | ((previous: string) => string)) => void;
  selectedIndex: number;
  filtered: CommandDefinition[];
  total: number;
  open?: () => void;
  toggle?: () => void;
  next: () => void;
  prev: () => void;
  insertCommand: () => void;
  close: () => void;
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

export function buildModeViewContext({
  chatMode,
  turns,
  inputValue,
  setInput,
  handleSubmit,
  shouldSubmit,
  isLoading,
  pending,
  paletteOpen,
  commandResult,
  agentMode,
  activePanel,
  featureContext,
  subAgents,
  subAgentIndex,
  toolsExpanded,
  viewportKey,
}: BuildModeViewContextInput): ChatModeRenderContext {
  const conversation = {
    input: {
      value: inputValue,
      setValue: setInput,
      submit: handleSubmit,
      shouldSubmit,
    },
    runtime: {
      isLoading,
      pending,
      paletteOpen,
      commandResult,
      agentMode,
    },
    transcript: {
      turns: turns,
      toolsExpanded,
      viewportKey,
    },
    panel: {
      active: activePanel,
      context: featureContext,
    },
  };

  switch (chatMode) {
    case "input":
      return {
        chatMode,
        ...conversation,
      };
    case "subagent-picker":
      return {
        chatMode,
        ...conversation,
        subAgents: {
          blocks: subAgents,
          selectedIndex: subAgentIndex,
        },
      };
    case "subagent-detail":
      return {
        chatMode,
        toolsExpanded,
        subAgents: {
          blocks: subAgents,
          selectedIndex: subAgentIndex,
        },
      };
  }
}

export function buildPendingActionModel(
  pending: ConfirmRequest | null | undefined,
  scrollOffset?: number,
  activeHunkIndex?: number,
  hunkCount?: number,
): PendingActionPanelProps | null {
  if (!pending) return null;

  return {
    display: createToolDisplay({
      toolName: pending.toolName,
      toolArgs: pending.args,
      status: "pending",
      filePath: pending.filePath,
      diff: pending.diff,
    }),
    scrollOffset,
    activeHunkIndex,
    hunkCount,
    helpText: pending.warning,
  };
}

export function buildPendingQuestionModel(input: {
  pending: AskQuestionRequest | null | undefined;
  answerInput: string;
  setAnswerInput: (value: string) => void;
  submitAnswer: () => void;
  shouldSubmitAnswer: (value: string) => boolean;
}): PendingQuestionPanelProps | null {
  if (!input.pending) return null;

  return {
    pending: input.pending,
    input: input.answerInput,
    setInput: input.setAnswerInput,
    submit: input.submitAnswer,
    shouldSubmit: input.shouldSubmitAnswer,
  };
}

export function buildSuggestionsModel(
  suggestion: CommandSuggestionState,
  paletteOpen: boolean,
): VisibilityModel<CommandSuggestionsProps> {
  return {
    visible: !paletteOpen && suggestion.show && suggestion.filtered.length > 0,
    props: {
      commands: suggestion.filtered,
      selectedIndex: suggestion.selectedIndex,
      maxVisibleCount: suggestion.maxVisibleCount,
    },
  };
}

export function buildPaletteModel(
  palette: CommandPaletteState,
): VisibilityModel<CommandPaletteProps> {
  return {
    visible: palette.isOpen,
    props: {
      search: palette.search,
      setSearch: palette.setSearch,
      selectedIndex: palette.selectedIndex,
      filtered: palette.filtered,
      total: palette.total,
      next: palette.next,
      prev: palette.prev,
      insertCommand: palette.insertCommand,
      close: palette.close,
    },
  };
}

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
