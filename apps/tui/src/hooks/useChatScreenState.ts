import { useEffect, useState, useCallback } from "react";
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
import { getHelpShortcuts } from "../lib/helpShortcuts.js";

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

  const [helpOpen, setHelpOpen] = useState(false);
  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);
  const helpShortcuts = getHelpShortcuts(
    subAgentNav.chatMode,
    !!confirmation.pending,
    isLoading,
    suggestion.show && suggestion.filtered.length > 0,
    !!panel.activePanelId,
  );

  const palette = useCommandPalette({
    commands: agent.getCommands(),
    executeCommand: (input: string) => { void agent.executeCommand(input); },
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
    handleSubmit,
    openPalette: palette.toggle,
    toggleHelp,
  });

  return {
    input: inputHistory.input,
    setInput: inputHistory.setInput,
    chatMode: subAgentNav.chatMode,
    subAgents: subAgentNav.subAgentBlocks,
    subAgentIndex: subAgentNav.subAgentIndex,
    selectedSubAgentId: subAgentNav.chatMode === "subagent-picker" || subAgentNav.chatMode === "subagent-detail"
      ? subAgentNav.subAgentBlocks[subAgentNav.subAgentIndex]?.id ?? null
      : null,
    toolCount: toolNav.toolBlocks.length,
    selectedToolId: subAgentNav.chatMode === "tool-focus" || subAgentNav.chatMode === "tool-detail" ? toolNav.selectedToolId : null,
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
    helpOpen,
    helpShortcuts,
  };
}
