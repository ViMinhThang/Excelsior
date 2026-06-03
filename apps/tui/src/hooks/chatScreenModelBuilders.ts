import { createToolDisplay } from "@excelsior/core";
import type {
  AgentMode,
  AskQuestionRequest,
  CommandDefinition,
  ConfirmRequest,
  ProjectedBlock,
} from "@excelsior/core";
import type { FooterBarProps } from "../components/chat/FooterBar.js";
import type { PendingActionPanelProps } from "../components/chat/PendingActionPanel.js";
import type { PendingQuestionPanelProps } from "../components/chat/PendingQuestionPanel.js";
import type { CommandSuggestionsProps } from "../components/chat/CommandSuggestions.js";
import type { CommandPaletteProps } from "../components/palette/CommandPalette.js";
import type { TuiPanelContext, TuiPanelDefinition } from "../lib/panels.js";
import type {
  ChatMode,
  ChatModeRenderContext,
  CommandSuggestionState,
  SubAgentBlock,
} from "../chatModes/types.js";

export interface VisibilityModel<TProps> {
  visible: boolean;
  props: TProps;
}

export interface ChatScreenModel {
  modeView: ChatModeRenderContext;
  pendingAction: PendingActionPanelProps | null;
  pendingQuestion: PendingQuestionPanelProps | null;
  suggestions: VisibilityModel<CommandSuggestionsProps>;
  palette: VisibilityModel<CommandPaletteProps>;
  footer: FooterBarProps;
}

export interface BuildModeViewContextInput {
  chatMode: ChatMode;
  displayBlocks: ProjectedBlock[];
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
  commandsExpanded: boolean;
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

export function buildModeViewContext({
  chatMode,
  displayBlocks,
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
  commandsExpanded,
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
      blocks: displayBlocks,
      commandsExpanded,
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
        commandsExpanded,
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
  commandCount: number;
  commandsExpanded: boolean;
  workspaceRootPath: string;
  totalTokens?: number;
}): FooterBarProps {
  const footer: FooterBarProps = {
    chatMode: input.chatMode,
    isLoading: input.isLoading,
    hasPending: !!input.pending,
    activePanelId: input.activePanelId,
    subAgentCount: input.subAgentCount,
    commandCount: input.commandCount,
    commandsExpanded: input.commandsExpanded,
    workspaceRootPath: input.workspaceRootPath,
    totalTokens: input.totalTokens,
  };
  if (input.pendingKind) footer.pendingKind = input.pendingKind;
  return footer;
}
