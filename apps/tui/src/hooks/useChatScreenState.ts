import { useEffect } from "react";
import { useNavigation } from "../context/NavigationContext.js";
import { useAgentManager } from "./useAgentManager.js";
import { useToolConfirmation } from "./useToolConfirmation.js";
import { useCommandAutocomplete } from "./useCommandAutocomplete.js";
import { useInputHistory } from "./useInputHistory.js";
import { useSubAgentNavigation } from "./useSubAgentNavigation.js";
import { useCommandResult } from "./useCommandResult.js";
import { useChatPanel } from "./useChatPanel.js";
import { useChatSubmission } from "./useChatSubmission.js";
import { useChatKeymaps } from "./useChatKeymaps.js";

export function useChatScreenState() {
  const { navigate } = useNavigation();
  const agent = useAgentManager();
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
    setCommandResult: command.setCommandResult,
    openSubAgent: subAgentNav.openSubAgent,
    nextSubAgent: subAgentNav.nextSubAgent,
    prevSubAgent: subAgentNav.prevSubAgent,
    navigateUp: inputHistory.navigateUp,
    navigateDown: inputHistory.navigateDown,
    handleSubmit,
  });

  return {
    input: inputHistory.input,
    setInput: inputHistory.setInput,
    chatMode: subAgentNav.chatMode,
    subAgents: subAgentNav.subAgentBlocks,
    subAgentIndex: subAgentNav.subAgentIndex,
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
  };
}
