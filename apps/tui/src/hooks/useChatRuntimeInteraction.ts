import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDoubleEscapeCancelState,
  handleDoubleEscapeCancel,
  resetDoubleEscapeCancel,
  type CommandDefinition,
  type CommandResult,
  type ProjectedTurn,
  type Session,
} from "@excelsior/core";
import { getCommandInputWithSelection } from "../chatModes/inputMode.js";
import { shouldAllowChatInputSubmit } from "../lib/commandSubmission.js";
import { useViewportReset } from "../platform/opentui/useViewportReset.js";
import {
  buildChatInteractionState,
} from "./chatScreenViewModel.js";
import {
  createHistoryResetSnapshot,
  shouldResetHistory,
} from "./historyReset.js";
import {
  buildOptimisticTranscript,
  shouldClearOptimisticMessage,
} from "./optimisticTranscript.js";
import { useChatKeymaps } from "./useChatKeymaps.js";
import { useChatPanel } from "./useChatPanel.js";
import { useChatSubmission } from "./useChatSubmission.js";
import { useCommandAutocomplete } from "./useCommandAutocomplete.js";
import { useCommandPalette } from "./useCommandPalette.js";
import { useCommandResult } from "./useCommandResult.js";
import { useInputHistory } from "./useInputHistory.js";
import { useSubAgentNavigation } from "./useSubAgentNavigation.js";
import type { useQuestionResponse } from "./useQuestionResponse.js";
import type { useToolConfirmation } from "./useToolConfirmation.js";

interface UseChatRuntimeInteractionOptions {
  turns: ProjectedTurn[];
  isLoading: boolean;
  currentSessionId: string | null;
  mode: "plan" | "act";
  sessions: Session[];
  commands: CommandDefinition[];
  confirmation: ReturnType<typeof useToolConfirmation>;
  question: ReturnType<typeof useQuestionResponse>;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  send: (content: string) => void;
  executeCommand: (input: string) => Promise<CommandResult>;
  cancel: () => void;
  toggleMode: () => "plan" | "act" | undefined;
  navigate: (screen: "settings") => void;
}

export function useChatRuntimeInteraction({
  turns,
  isLoading,
  currentSessionId,
  mode,
  sessions,
  commands,
  confirmation,
  question,
  switchSession,
  deleteSession,
  send,
  executeCommand: executeAgentCommand,
  cancel,
  toggleMode,
  navigate,
}: UseChatRuntimeInteractionOptions) {
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<string | null>(null);

  const sendWithOptimisticMessage = useCallback((content: string) => {
    setOptimisticUserMessage(content);
    send(content);
  }, [send]);

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
  const [inputFocused, setInputFocused] = useState(true);
  const subAgentNav = useSubAgentNavigation(derivedTurns);
  const command = useCommandResult(inputHistory.input);
  const suggestion = useCommandAutocomplete(inputHistory.input);
  const palette = useCommandPalette({
    commands,
    setInput: inputHistory.setInput,
  });
  const panel = useChatPanel({
    sessions,
    currentSessionId,
    switchSession,
    deleteSession,
    resetInput: inputHistory.resetInput,
    setCommandResult: command.setCommandResult,
  });

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

  const toggleToolsExpanded = useCallback(() => {
    setToolsExpanded((expanded) => !expanded);
  }, []);

  const escapeCancelState = useRef(createDoubleEscapeCancelState());
  const requestTurnCancel = useCallback(() => {
    handleDoubleEscapeCancel({
      state: escapeCancelState.current,
      isLoading,
      now: Date.now(),
      cancel,
    });
  }, [cancel, isLoading]);

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
    inputFocused,
    suggestion,
    setInput: inputHistory.setInput,
    submit: () => submitRef.current(),
    cancel,
    toggleMode,
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
    return executeAgentCommand(input);
  }, [executeAgentCommand]);

  const handleSubmit = useChatSubmission({
    isLoading,
    inputRef: inputHistory.inputRef,
    executeCommand,
    send: sendWithOptimisticMessage,
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
    cancel,
    requestTurnCancel,
  });

  return {
    command,
    derivedTurns,
    handleSubmit,
    inputHistory,
    interactionState,
    panel,
    palette,
    shouldSubmit,
    inputFocused,
    setInputFocused,
    subAgentNav,
    suggestion,
    toolsExpanded,
    viewportKey: `${currentSessionId ?? "none"}:${historyResetKey}`,
    mode,
  };
}
