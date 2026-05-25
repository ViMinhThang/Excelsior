import { useEffect } from "react";
import {
  buildChatModeKeymapContext,
  getChatModeSelection,
  getCommandInputWithSelection,
} from "../chatModes/index.js";
import {
  buildFooterModel,
  buildModeViewContext,
  buildPaletteModel,
  buildPendingActionModel,
  buildSuggestionsModel,
  type ChatScreenModel,
} from "./chatScreenModelBuilders.js";
import { useNavigation } from "../context/NavigationContext.js";
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

export function useChatInteractionController(): ChatScreenModel {
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

  const openToolFocus = () => {
    if (toolNav.toolBlocks.length > 0) subAgentNav.setChatMode("tool-focus");
  };
  const openToolDetail = () => {
    if (toolNav.selectedToolId) subAgentNav.setChatMode("tool-detail");
  };
  const inputModeKeymap = {
    chatMode: "input" as const,
    pending: confirmation.pending,
    activePanelId: panel.activePanelId,
    isPaletteOpen: palette.isOpen,
    isLoading,
    suggestion,
    setInput: inputHistory.setInput,
    cancel: agent.cancel,
    toggleMode: agent.toggleMode,
    openSubAgent: subAgentNav.openSubAgent,
    openToolFocus,
    navigateUp: inputHistory.navigateUp,
    navigateDown: inputHistory.navigateDown,
    openPalette: palette.toggle,
  };
  const chatModeKeymap = buildChatModeKeymapContext({
    ...inputModeKeymap,
    chatMode: subAgentNav.chatMode,
    setChatMode: subAgentNav.setChatMode,
    nextSubAgent: subAgentNav.nextSubAgent,
    prevSubAgent: subAgentNav.prevSubAgent,
    openToolDetail,
    nextTool: toolNav.nextTool,
    prevTool: toolNav.prevTool,
    toggleSelectedTool: toolNav.toggleSelectedTool,
  });

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
    getSubmittedInput: () => getCommandInputWithSelection(inputModeKeymap, inputHistory.input),
  });

  const shouldSubmitInput = () => true;

  useChatKeymaps({
    ...chatModeKeymap,
    pending: confirmation.pending,
    approve: confirmation.approve,
    approveAll: confirmation.approveAll,
    deny: confirmation.deny,
    scrollUp: confirmation.scrollUp,
    scrollDown: confirmation.scrollDown,
    nextHunk: confirmation.nextHunk,
    prevHunk: confirmation.prevHunk,
    cancel: agent.cancel,
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
