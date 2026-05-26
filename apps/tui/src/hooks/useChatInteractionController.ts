import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildChatModeKeymapContext,
  getCommandInputWithSelection,
} from "../chatModes/index.js";
import {
  buildFooterModel,
  buildModeViewContext,
  buildPaletteModel,
  buildPendingActionModel,
  buildPendingQuestionModel,
  buildSuggestionsModel,
  type ChatScreenModel,
} from "./chatScreenModelBuilders.js";
import { useNavigation } from "../context/NavigationContext.js";
import { useAgentHostClient } from "./useAgentHostClient.js";
import { useToolConfirmation } from "./useToolConfirmation.js";
import { useQuestionResponse } from "./useQuestionResponse.js";
import { useCommandAutocomplete } from "./useCommandAutocomplete.js";
import { useInputHistory } from "./useInputHistory.js";
import { useSubAgentNavigation } from "./useSubAgentNavigation.js";
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
    pendingQuestion,
  } = agent.state;

  const inputHistory = useInputHistory(displayBlocks);
  const subAgentNav = useSubAgentNavigation(displayBlocks);
  const [commandsExpanded, setCommandsExpanded] = useState(false);
  const commandCount = useMemo(
    () => displayBlocks.reduce((count, block) => {
      if (block.type === "tool-call") return count + 1;
      if (block.type === "sub-agent") return count + block.state.toolCalls.length;
      return count;
    }, 0),
    [displayBlocks],
  );
  const command = useCommandResult(inputHistory.input);
  const confirmation = useToolConfirmation(
    pendingConfirmation,
    agent.respondToConfirmation,
    agent.approveAllConfirmations,
  );
  const question = useQuestionResponse(
    pendingQuestion,
    agent.respondToQuestion,
  );
  const pending = confirmation.pending ?? question.pending;
  const pendingKind = question.pending
    ? "question" as const
    : confirmation.pending
      ? "confirmation" as const
      : null;
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
    if (!pending) return;
    subAgentNav.setChatMode("input");
    setCommandsExpanded(false);
  }, [pending, subAgentNav]);

  const toggleCommandsExpanded = useCallback(() => {
    setCommandsExpanded((expanded) => !expanded);
  }, []);

  const setChatMode = useCallback((nextMode: typeof subAgentNav.chatMode) => {
    subAgentNav.setChatMode(nextMode);
    if (nextMode === "input") setCommandsExpanded(false);
  }, [subAgentNav]);

  const openSubAgent = useCallback(() => {
    setCommandsExpanded(true);
    subAgentNav.openSubAgent();
  }, [subAgentNav]);

  const inputModeKeymap = {
    chatMode: "input" as const,
    pending,
    activePanelId: panel.activePanelId,
    isPaletteOpen: palette.isOpen,
    isLoading,
    suggestion,
    setInput: inputHistory.setInput,
    cancel: agent.cancel,
    toggleMode: agent.toggleMode,
    openSubAgent,
    subAgentCount: subAgentNav.subAgentBlocks.length,
    commandCount,
    commandsExpanded,
    toggleCommandsExpanded,
    navigateUp: inputHistory.navigateUp,
    navigateDown: inputHistory.navigateDown,
    openPalette: palette.toggle,
  };
  const chatModeKeymap = buildChatModeKeymapContext({
    ...inputModeKeymap,
    chatMode: subAgentNav.chatMode,
    setChatMode,
    nextSubAgent: subAgentNav.nextSubAgent,
    prevSubAgent: subAgentNav.prevSubAgent,
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
    pending,
    confirmationPending: confirmation.pending,
    questionPending: question.pending,
    approve: confirmation.approve,
    approveAll: confirmation.approveAll,
    deny: confirmation.deny,
    cancelQuestion: question.cancel,
    scrollUp: confirmation.scrollUp,
    scrollDown: confirmation.scrollDown,
    nextHunk: confirmation.nextHunk,
    prevHunk: confirmation.prevHunk,
    cancel: agent.cancel,
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
      pending,
      paletteOpen: palette.isOpen,
      commandResult: command.commandResult,
      agentMode: mode,
      activePanel: panel.activePanel,
      featureContext: panel.panelContext,
      subAgents: subAgentNav.subAgentBlocks,
      subAgentIndex: subAgentNav.subAgentIndex,
      commandsExpanded,
    }),
    pendingAction: buildPendingActionModel(
      confirmation.pending,
      confirmation.scrollOffset,
      confirmation.activeHunkIndex,
      confirmation.hunkCount,
    ),
    pendingQuestion: buildPendingQuestionModel({
      pending: question.pending,
      answerInput: question.input,
      setAnswerInput: question.setInput,
      submitAnswer: question.submit,
      shouldSubmitAnswer: question.shouldSubmit,
    }),
    suggestions: buildSuggestionsModel(suggestion, palette.isOpen),
    palette: buildPaletteModel(palette),
    footer: buildFooterModel({
      chatMode: subAgentNav.chatMode,
      isLoading,
      pending,
      pendingKind,
      activePanelId: panel.activePanelId,
      subAgentCount: subAgentNav.subAgentBlocks.length,
      commandCount,
      commandsExpanded,
      workspaceRootPath: workspace.rootPath,
    }),
  };
}
