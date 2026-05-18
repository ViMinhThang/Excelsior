import { useEffect } from "react";
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
import { getChatModeSelection } from "../chatModes/index.js";

export function useChatScreenState() {
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
  });

  useChatKeymaps({
    pending: confirmation.pending,
    approve: confirmation.approve,
    approveAll: confirmation.approveAll,
    deny: confirmation.deny,
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

  const selectedToolBlock = selection.selectedToolId
    ? toolNav.toolBlocks.find((tool) => tool.id === selection.selectedToolId)
    : undefined;

  return {
    input: inputHistory.input,
    setInput: inputHistory.setInput,
    chatMode: subAgentNav.chatMode,
    subAgents: subAgentNav.subAgentBlocks,
    subAgentIndex: subAgentNav.subAgentIndex,
    selectedSubAgentId: selection.selectedSubAgentId,
    toolBlocks: toolNav.toolBlocks,
    toolCount: toolNav.toolBlocks.length,
    selectedToolId: selection.selectedToolId,
    selectedToolBlock,
    expandedToolIds: toolNav.expandedToolIds,
    messages: displayBlocks,
    activePanel: panel.activePanel,
    activePanelId: panel.activePanelId,
    isLoading,
    currentSessionId,
    workspace,
    pending: confirmation.pending,
    suggestion,
    handleSubmit,
    commandResult: command.commandResult,
    mode,
    featureContext: panel.panelContext,
    palette,
  };
}
