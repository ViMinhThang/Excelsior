import { useEffect } from "react";
import type {
  AgentMode,
  ConfirmRequest,
  ProjectedBlock,
} from "@excelsior/core";
import { useNavigation } from "../context/NavigationContext.js";
import type { FooterBarProps } from "../components/chat/FooterBar.js";
import type { PendingActionPanelProps } from "../components/chat/PendingActionPanel.js";
import type { CommandSuggestionsProps } from "../components/chat/CommandSuggestions.js";
import type { CommandPaletteProps } from "../components/palette/CommandPalette.js";
import type { TuiPanelContext, TuiPanelDefinition } from "../lib/panels.js";
import { createToolDisplay } from "../lib/toolDisplay.js";
import {
  type ChatMode,
  type ChatModeRenderContext,
  type CommandSuggestionState,
  type SubAgentBlock,
  type ToolBlock,
  getChatModeSelection,
  getCommandInputWithSelection,
} from "../chatModes/index.js";
import { useAgentHostClient } from "./useAgentHostClient.js";
import { useToolConfirmation } from "./useToolConfirmation.js";
import { useCommandAutocomplete } from "./useCommandAutocomplete.js";
import { useInputHistory } from "./useInputHistory.js";
import { useSubAgentNavigation } from "./useSubAgentNavigation.js";
import { useToolNavigation } from "./useToolNavigation.js";
import { useCommandResult } from "./useCommandResult.js";
import { useChatPanel } from "./useChatPanel.js";
import { useChatSubmission } from "./useChatSubmission.js";
import { useChatKeymaps } from "./useChatKeymaps.js";
import { useCommandPalette } from "./useCommandPalette.js";

interface VisibilityModel<TProps> {
  visible: boolean;
  props: TProps;
}

type CommandPaletteState = ReturnType<typeof useCommandPalette>;

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

  return {
    chatMode,
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
    subAgents: {
      blocks: subAgents,
      selectedIndex: subAgentIndex,
    },
    tools: {
      blocks: toolBlocks,
      selectedId: selectedToolId,
      selectedBlock: selectedToolBlock,
    },
    panel: {
      active: activePanel,
      context: featureContext,
    },
  };
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

export function useChatScreenModel(): ChatScreenModel {
  const { navigate } = useNavigation();
  const agent = useAgentHostClient();
  const {
    displayBlocks,
    isLoading,
    sessions,
    currentSessionId,
    workspace,
    mode,
    pendingConfirmation,
  } = agent.state;

  const inputHistory = useInputHistory(displayBlocks);
  const subAgentNav = useSubAgentNavigation(displayBlocks);
  const toolNav = useToolNavigation(displayBlocks);
  const command = useCommandResult(inputHistory.input);
  const confirmation = useToolConfirmation(
    pendingConfirmation,
    agent.respondToConfirmation,
    agent.approveAllConfirmations,
  );
  const suggestion = useCommandAutocomplete(inputHistory.input);

  const panel = useChatPanel({
    sessions,
    currentSessionId,
    switchSession: agent.switchSession,
    deleteSession: agent.deleteSession,
    resetInput: inputHistory.resetInput,
    setCommandResult: command.setCommandResult,
  });

  const palette = useCommandPalette({
    commands: agent.getCommands(),
    setInput: inputHistory.setInput,
  });

  useEffect(() => {
    if (confirmation.pending) subAgentNav.setChatMode("input");
  }, [confirmation.pending, subAgentNav]);

  const handleSubmit = useChatSubmission({
    isLoading,
    inputRef: inputHistory.inputRef,
    executeCommand: agent.executeCommand,
    send: agent.send,
    resetInput: inputHistory.resetInput,
    setInput: inputHistory.setInput,
    setCommandResult: command.setCommandResult,
    openPanel: panel.openPanel,
    navigate,
    getSubmittedInput: () => getCommandInputWithSelection({
      pending: confirmation.pending,
      activePanelId: panel.activePanelId,
      isPaletteOpen: palette.isOpen,
      isLoading,
      chatMode: subAgentNav.chatMode,
      setChatMode: subAgentNav.setChatMode,
      suggestion,
      setInput: inputHistory.setInput,
      cancel: agent.cancel,
      toggleMode: agent.toggleMode,
      openSubAgent: subAgentNav.openSubAgent,
      nextSubAgent: subAgentNav.nextSubAgent,
      prevSubAgent: subAgentNav.prevSubAgent,
      openToolFocus: () => {
        if (toolNav.toolBlocks.length > 0) subAgentNav.setChatMode("tool-focus");
      },
      openToolDetail: () => {
        if (toolNav.selectedToolId) subAgentNav.setChatMode("tool-detail");
      },
      nextTool: toolNav.nextTool,
      prevTool: toolNav.prevTool,
      toggleSelectedTool: toolNav.toggleSelectedTool,
      navigateUp: inputHistory.navigateUp,
      navigateDown: inputHistory.navigateDown,
      openPalette: palette.toggle,
    }),
  });

  const shouldSubmitInput = () => true;

  useChatKeymaps({
    pending: confirmation.pending,
    approve: confirmation.approve,
    approveAll: confirmation.approveAll,
    deny: confirmation.deny,
    scrollUp: confirmation.scrollUp,
    scrollDown: confirmation.scrollDown,
    nextHunk: confirmation.nextHunk,
    prevHunk: confirmation.prevHunk,
    cancel: agent.cancel,
    chatMode: subAgentNav.chatMode,
    setChatMode: subAgentNav.setChatMode,
    suggestion,
    setInput: inputHistory.setInput,
    activePanelId: panel.activePanelId,
    isPaletteOpen: palette.isOpen,
    isLoading,
    toggleMode: agent.toggleMode,
    openSubAgent: subAgentNav.openSubAgent,
    nextSubAgent: subAgentNav.nextSubAgent,
    prevSubAgent: subAgentNav.prevSubAgent,
    openToolFocus: () => {
      if (toolNav.toolBlocks.length > 0) subAgentNav.setChatMode("tool-focus");
    },
    openToolDetail: () => {
      if (toolNav.selectedToolId) subAgentNav.setChatMode("tool-detail");
    },
    nextTool: toolNav.nextTool,
    prevTool: toolNav.prevTool,
    toggleSelectedTool: toolNav.toggleSelectedTool,
    navigateUp: inputHistory.navigateUp,
    navigateDown: inputHistory.navigateDown,
    openPalette: palette.toggle,
  });

  const selection = getChatModeSelection(subAgentNav.chatMode, {
    subAgents: subAgentNav.subAgentBlocks,
    subAgentIndex: subAgentNav.subAgentIndex,
    selectedToolId: toolNav.selectedToolId,
  });

  return {
    modeView: buildModeViewContext({
      chatMode: subAgentNav.chatMode,
      displayBlocks,
      inputValue: inputHistory.input,
      setInput: inputHistory.setInput,
      handleSubmit,
      shouldSubmit: shouldSubmitInput,
      isLoading,
      pending: confirmation.pending,
      paletteOpen: palette.isOpen,
      commandResult: command.commandResult,
      agentMode: mode,
      activePanel: panel.activePanel,
      featureContext: panel.panelContext,
      subAgents: subAgentNav.subAgentBlocks,
      subAgentIndex: subAgentNav.subAgentIndex,
      toolBlocks: toolNav.toolBlocks,
      selectedSubAgentId: selection.selectedSubAgentId,
      selectedToolId: selection.selectedToolId,
      expandedToolIds: toolNav.expandedToolIds,
    }),
    pendingAction: buildPendingActionModel(
      confirmation.pending,
      confirmation.scrollOffset,
      confirmation.activeHunkIndex,
      confirmation.hunkCount,
    ),
    suggestions: buildSuggestionsModel(suggestion, palette.isOpen),
    palette: buildPaletteModel(palette),
    footer: buildFooterModel({
      chatMode: subAgentNav.chatMode,
      isLoading,
      pending: confirmation.pending,
      activePanelId: panel.activePanelId,
      subAgentCount: subAgentNav.subAgentBlocks.length,
      toolCount: toolNav.toolBlocks.length,
      workspaceRootPath: workspace.rootPath,
    }),
  };
}
