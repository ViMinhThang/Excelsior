import type {
  AgentMode,
  CommandDefinition,
  ConfirmRequest,
  ProjectedBlock,
} from "@excelsior/core";
import type { FooterBarProps } from "../components/chat/FooterBar.js";
import type { PendingActionPanelProps } from "../components/chat/PendingActionPanel.js";
import type { CommandSuggestionsProps } from "../components/chat/CommandSuggestions.js";
import type { CommandPaletteProps } from "../components/palette/CommandPalette.js";
import type { TuiPanelContext, TuiPanelDefinition } from "../lib/panels.js";
import { createToolDisplay } from "../lib/toolDisplay.js";
import type {
  ChatMode,
  ChatModeRenderContext,
  CommandSuggestionState,
  SubAgentBlock,
  ToolBlock,
} from "../chatModes/index.js";

export interface VisibilityModel<TProps> {
  visible: boolean;
  props: TProps;
}

export interface ChatScreenModel {
  modeView: ChatModeRenderContext;
  pendingAction: PendingActionPanelProps | null;
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
  toolBlocks: ToolBlock[];
  selectedSubAgentId: string | null;
  selectedToolId: string | null;
  expandedToolIds: ReadonlySet<string>;
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
  toolBlocks,
  selectedSubAgentId,
  selectedToolId,
  expandedToolIds,
}: BuildModeViewContextInput): ChatModeRenderContext {
  const selectedToolBlock = selectedToolId
    ? toolBlocks.find((tool) => tool.id === selectedToolId)
    : undefined;

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
      selectedSubAgentId,
      selectedToolId,
      expandedToolIds,
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
        subAgents: {
          blocks: subAgents,
          selectedIndex: subAgentIndex,
        },
      };
    case "tool-focus":
    case "tool-detail":
      return {
        chatMode,
        ...conversation,
        tools: {
          blocks: toolBlocks,
          selectedId: selectedToolId,
          selectedBlock: selectedToolBlock,
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
    pending,
    display: createToolDisplay({
      toolName: pending.toolName,
      toolArgs: pending.args,
      status: "pending",
    }),
    scrollOffset,
    activeHunkIndex,
    hunkCount,
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
  activePanelId: string | null;
  subAgentCount: number;
  toolCount: number;
  workspaceRootPath: string;
}): FooterBarProps {
  return {
    chatMode: input.chatMode,
    isLoading: input.isLoading,
    hasPending: !!input.pending,
    activePanelId: input.activePanelId,
    subAgentCount: input.subAgentCount,
    toolCount: input.toolCount,
    workspaceRootPath: input.workspaceRootPath,
  };
}
