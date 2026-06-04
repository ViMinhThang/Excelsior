import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDoubleEscapeCancelState,
  handleDoubleEscapeCancel,
  resetDoubleEscapeCancel,
} from "@excelsior/core";
import { getCommandInputWithSelection } from "../chatModes/inputMode.js";
import {
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
import {
  buildChatControlPlane,
  shouldCollapseCommandsForChatMode,
  shouldResetChatModeForPending,
} from "./chatScreenControlPlane.js";
import {
  buildOptimisticTranscript,
  shouldClearOptimisticMessage,
} from "./optimisticTranscript.js";

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

  const [optimisticUserMessage, setOptimisticUserMessage] = useState<string | null>(null);

  const customSend = useCallback((content: string) => {
    setOptimisticUserMessage(content);
    agent.send(content);
  }, [agent.send]);

  const derivedDisplayBlocks = useMemo(() => buildOptimisticTranscript({
    displayBlocks,
    optimisticUserMessage,
  }), [displayBlocks, optimisticUserMessage]);

  useEffect(() => {
    if (shouldClearOptimisticMessage(displayBlocks, optimisticUserMessage)) {
      setOptimisticUserMessage(null);
    }
  }, [displayBlocks, optimisticUserMessage]);

  useEffect(() => {
    setOptimisticUserMessage(null);
  }, [currentSessionId]);

  const [wasLoading, setWasLoading] = useState(false);
  useEffect(() => {
    if (isLoading) {
      setWasLoading(true);
    } else if (wasLoading) {
      setOptimisticUserMessage(null);
      setWasLoading(false);
    }
  }, [isLoading, wasLoading]);

  const inputHistory = useInputHistory(derivedDisplayBlocks);
  const subAgentNav = useSubAgentNavigation(derivedDisplayBlocks);
  const [commandsExpanded, setCommandsExpanded] = useState(false);
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

  const toggleCommandsExpanded = useCallback(() => {
    setCommandsExpanded((expanded) => !expanded);
  }, []);

  const escapeCancelState = useRef(createDoubleEscapeCancelState());
  const requestTurnCancel = useCallback(() => {
    handleDoubleEscapeCancel({
      state: escapeCancelState.current,
      isLoading,
      now: Date.now(),
      cancel: agent.cancel,
    });
  }, [agent.cancel, isLoading]);

  useEffect(() => {
    if (!isLoading) resetDoubleEscapeCancel(escapeCancelState.current);
  }, [isLoading]);

  const setChatMode = useCallback((nextMode: typeof subAgentNav.chatMode) => {
    subAgentNav.setChatMode(nextMode);
    if (shouldCollapseCommandsForChatMode(nextMode)) setCommandsExpanded(false);
  }, [subAgentNav.setChatMode]);

  const openSubAgent = useCallback(() => {
    setCommandsExpanded(true);
    subAgentNav.openSubAgent();
  }, [subAgentNav.openSubAgent]);

  const controlPlane = buildChatControlPlane({
    displayBlocks: derivedDisplayBlocks,
    chatMode: subAgentNav.chatMode,
    isLoading,
    pendingConfirmation: confirmation.pending,
    pendingQuestion: question.pending,
    activePanelId: panel.activePanelId,
    isPaletteOpen: palette.isOpen,
    suggestion,
    setInput: inputHistory.setInput,
    cancel: agent.cancel,
    toggleMode: agent.toggleMode,
    openSubAgent,
    subAgentBlocks: subAgentNav.subAgentBlocks,
    commandsExpanded,
    toggleCommandsExpanded,
    navigateUp: inputHistory.navigateUp,
    navigateDown: inputHistory.navigateDown,
    openPalette: palette.toggle,
    setChatMode,
    nextSubAgent: subAgentNav.nextSubAgent,
    prevSubAgent: subAgentNav.prevSubAgent,
    workspaceRootPath: workspace.rootPath,
  });

  useEffect(() => {
    if (!shouldResetChatModeForPending(controlPlane.pending)) return;
    subAgentNav.setChatMode("input");
    setCommandsExpanded(false);
  }, [controlPlane.pending, subAgentNav.setChatMode]);

  const handleSubmit = useChatSubmission({
    isLoading,
    inputRef: inputHistory.inputRef,
    executeCommand: agent.executeCommand,
    send: customSend,
    resetInput: inputHistory.resetInput,
    setInput: inputHistory.setInput,
    setCommandResult: command.setCommandResult,
    openPanel: panel.openPanel,
    navigate,
    getSubmittedInput: () => getCommandInputWithSelection(
      controlPlane.inputModeKeymap,
      inputHistory.input,
    ),
  });

  const shouldSubmitInput = () => true;

  useChatKeymaps({
    ...controlPlane.chatModeKeymap,
    pending: controlPlane.pending,
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
    requestTurnCancel,
  });

  const totalTokens = useMemo(() => {
    let text = "";
    for (const block of derivedDisplayBlocks) {
      if (block.type === "user" || block.type === "assistant") {
        text += block.content;
      } else if (block.type === "tool-call") {
        text += block.toolName + block.toolArgs + block.content;
      } else if (block.type === "sub-agent") {
        text += block.role + block.state.fullOutput;
      }
    }
    let tokens = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0x4e00 && code <= 0x9fff) {
        tokens += 0.6;
      } else {
        tokens += 0.3;
      }
    }
    return Math.ceil(tokens);
  }, [derivedDisplayBlocks]);

  return {
    modeView: buildModeViewContext({
      chatMode: subAgentNav.chatMode,
      displayBlocks: derivedDisplayBlocks,
      inputValue: inputHistory.input,
      setInput: inputHistory.setInput,
      handleSubmit,
      shouldSubmit: shouldSubmitInput,
      isLoading,
      pending: controlPlane.pending,
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
    footer: {
      ...controlPlane.footer,
      totalTokens,
    },
  };
}
