import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDoubleEscapeCancelState,
  handleDoubleEscapeCancel,
  resetDoubleEscapeCancel,
} from "@excelsior/core";
import { getCommandInputWithSelection } from "../chatModes/inputMode.js";
import { shouldAllowChatInputSubmit } from "../lib/commandSubmission.js";
import {
  buildChatInteractionState,
  buildModeViewContext,
  buildPaletteModel,
  buildPendingActionModel,
  buildPendingQuestionModel,
  buildSuggestionsModel,
  type ChatScreenViewModel,
} from "./chatScreenViewModel.js";
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
  buildOptimisticTranscript,
  shouldClearOptimisticMessage,
} from "./optimisticTranscript.js";
import {
  createHistoryResetSnapshot,
  shouldResetHistory,
} from "./historyReset.js";
import { useViewportReset } from "../platform/opentui/useViewportReset.js";
import { estimateTranscriptTokens } from "../lib/tokenEstimate.js";
import { useGitBranch } from "./useGitBranch.js";

export function useChatInteractionController(): ChatScreenViewModel {
  const { navigate } = useNavigation();
  const agent = useAgentHostClient();
  const {
    turns,
    isLoading,
    sessions,
    currentSessionId,
    workspace,
    llm,
    mode,
    pendingConfirmation,
    pendingQuestion,
  } = agent.state;
  const branchName = useGitBranch(workspace.rootPath);

  const [optimisticUserMessage, setOptimisticUserMessage] = useState<string | null>(null);

  const customSend = useCallback((content: string) => {
    setOptimisticUserMessage(content);
    agent.send(content);
  }, [agent.send]);

  const derivedTurns = useMemo(() => buildOptimisticTranscript({
    turns,
    optimisticUserMessage,
  }), [turns, optimisticUserMessage]);

  useEffect(() => {
    if (shouldClearOptimisticMessage(turns, optimisticUserMessage)) {
      setOptimisticUserMessage(null);
    }
  }, [turns, optimisticUserMessage]);

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

  const inputHistory = useInputHistory(derivedTurns);
  const subAgentNav = useSubAgentNavigation(derivedTurns);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [historyResetKey, setHistoryResetKey] = useState(0);
  const historyResetSnapshot = useMemo(() => createHistoryResetSnapshot({
    sessionId: currentSessionId,
    turns: derivedTurns,
  }), [currentSessionId, derivedTurns]);
  const prevHistoryResetSnapshotRef = useRef(historyResetSnapshot);

  useEffect(() => {
    if (shouldResetHistory(prevHistoryResetSnapshotRef.current, historyResetSnapshot)) {
      setHistoryResetKey((k) => k + 1);
    }
    prevHistoryResetSnapshotRef.current = historyResetSnapshot;
  }, [historyResetSnapshot]);

  useViewportReset(historyResetKey);

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

  const toggleToolsExpanded = useCallback(() => {
    setToolsExpanded((expanded) => !expanded);
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
    if (nextMode === "input") setToolsExpanded(false);
  }, [subAgentNav.setChatMode]);

  const openSubAgent = useCallback(() => {
    setToolsExpanded(true);
    subAgentNav.openSubAgent();
  }, [subAgentNav.openSubAgent]);

  const submitRef = useRef<() => void>(() => {});

  const interactionState = buildChatInteractionState({
    turns: derivedTurns,
    chatMode: subAgentNav.chatMode,
    isLoading,
    pendingConfirmation: confirmation.pending,
    pendingQuestion: question.pending,
    activePanelId: panel.activePanelId,
    isPaletteOpen: palette.isOpen,
    suggestion,
    setInput: inputHistory.setInput,
    submit: () => submitRef.current(),
    cancel: agent.cancel,
    toggleMode: agent.toggleMode,
    openSubAgent,
    subAgentBlocks: subAgentNav.subAgentBlocks,
    toolsExpanded,
    toggleToolsExpanded,
    navigateUp: inputHistory.navigateUp,
    navigateDown: inputHistory.navigateDown,
    setChatMode,
    nextSubAgent: subAgentNav.nextSubAgent,
    prevSubAgent: subAgentNav.prevSubAgent,
  });

  useEffect(() => {
    if (!interactionState.pending) return;
    subAgentNav.setChatMode("input");
    setToolsExpanded(false);
  }, [interactionState.pending, subAgentNav.setChatMode]);

  const executeCommand = useCallback((input: string) => {
    if (input === "/compact" || input.startsWith("/compact ")) {
      setOptimisticUserMessage(null);
    }
    return agent.executeCommand(input);
  }, [agent.executeCommand]);

  const handleSubmit = useChatSubmission({
    isLoading,
    inputRef: inputHistory.inputRef,
    executeCommand,
    send: customSend,
    resetInput: inputHistory.resetInput,
    setCommandResult: command.setCommandResult,
    openPanel: panel.openPanel,
    navigate,
    getSubmittedInput: () => getCommandInputWithSelection(
      interactionState.inputModeKeymap,
      inputHistory.input,
    ),
  });
  submitRef.current = handleSubmit;

  const shouldSubmit = useCallback(
    (value: string) => shouldAllowChatInputSubmit(value, suggestion),
    [suggestion],
  );

  useChatKeymaps({
    ...interactionState.chatModeKeymap,
    pending: interactionState.pending,
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

  const totalTokens = useMemo(
    () => estimateTranscriptTokens(derivedTurns.flatMap((t) => t.blocks)),
    [derivedTurns],
  );

  return {
    header: {
      workspaceName: workspace.name,
      branchName,
      modelLabel: `${llm.providerName} · ${llm.modelName}`,
    },
    modeView: buildModeViewContext({
      chatMode: subAgentNav.chatMode,
      turns: derivedTurns,
      inputValue: inputHistory.input,
      setInput: inputHistory.setInput,
      handleSubmit,
      shouldSubmit,
      isLoading,
      pending: interactionState.pending,
      paletteOpen: palette.isOpen,
      commandResult: command.commandResult,
      agentMode: mode,
      activePanel: panel.activePanel,
      featureContext: panel.panelContext,
      subAgents: subAgentNav.subAgentBlocks,
      subAgentIndex: subAgentNav.subAgentIndex,
      toolsExpanded,
      viewportKey: `${currentSessionId ?? "none"}:${historyResetKey}`,
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
      ...interactionState.footer,
      totalTokens,
    },
  };
}
