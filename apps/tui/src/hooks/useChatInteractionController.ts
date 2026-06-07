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
import {
  createHistoryResetSnapshot,
  shouldResetHistory,
} from "./historyReset.js";

const TOKEN_ESTIMATE_TEXT_SCAN_LIMIT = 50_000;
const PENDING_TOOL_TOKEN_SCAN_LIMIT = 4_000;

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
  const [historyResetKey, setHistoryResetKey] = useState(0);
  const historyResetSnapshot = useMemo(() => createHistoryResetSnapshot({
    sessionId: currentSessionId,
    blocks: derivedDisplayBlocks,
  }), [currentSessionId, derivedDisplayBlocks]);
  const prevHistoryResetSnapshotRef = useRef(historyResetSnapshot);

  useEffect(() => {
    if (shouldResetHistory(prevHistoryResetSnapshotRef.current, historyResetSnapshot)) {
      setHistoryResetKey((k) => k + 1);
    }
    prevHistoryResetSnapshotRef.current = historyResetSnapshot;
  }, [historyResetSnapshot]);

  useEffect(() => {
    if (historyResetKey > 0) {
      process.stdout.write("\u001b[2J\u001b[3J\u001b[H");
    }
  }, [historyResetKey]);

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
    let tokens = 0;
    const addText = (text: string, scanLimit = TOKEN_ESTIMATE_TEXT_SCAN_LIMIT) => {
      tokens += estimateTokens(text, scanLimit);
    };
    for (const block of derivedDisplayBlocks) {
      if (block.type === "user" || block.type === "assistant") {
        addText(block.content);
      } else if (block.type === "tool-call") {
        addText(block.toolName);
        addText(
          block.toolArgs,
          block.status === "pending" ? PENDING_TOOL_TOKEN_SCAN_LIMIT : TOKEN_ESTIMATE_TEXT_SCAN_LIMIT,
        );
        addText(block.content);
      } else if (block.type === "sub-agent") {
        addText(block.role);
        addText(block.state.fullOutput);
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
      historyResetKey,
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

function estimateTokens(text: string, scanLimit: number): number {
  const scannedLength = Math.min(text.length, scanLimit);
  let tokens = 0;
  for (let i = 0; i < scannedLength; i++) {
    const code = text.charCodeAt(i);
    tokens += code >= 0x4e00 && code <= 0x9fff ? 0.6 : 0.3;
  }
  if (text.length > scanLimit) {
    tokens += (text.length - scanLimit) * 0.3;
  }
  return tokens;
}
