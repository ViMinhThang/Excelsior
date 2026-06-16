import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CommandDefinition,
  type CommandResult,
  type ProjectedTurn,
  type Session,
} from "@excelsior/core";
import { getCommandInputWithSelection } from "../chatModes/inputMode.js";
import { shouldAllowChatInputSubmit } from "../lib/commandSubmission.js";
import {
  buildChatInteractionState,
} from "./chatScreenViewModel.js";
import { useChatKeymaps } from "./useChatKeymaps.js";
import { useChatPanel } from "./useChatPanel.js";
import { useChatSubmission } from "./useChatSubmission.js";
import { useCommandAutocomplete } from "./useCommandAutocomplete.js";
import { useCommandPalette } from "./useCommandPalette.js";
import { useCommandResult } from "./useCommandResult.js";
import { useInputHistory } from "./useInputHistory.js";
import { useOptimisticTranscript } from "./useOptimisticTranscript.js";
import { useDoubleEscapeCancel } from "./useDoubleEscapeCancel.js";
import { useTranscriptViewportReset } from "./useTranscriptViewportReset.js";
import type { useToolConfirmation } from "./useToolConfirmation.js";
import type { useQuestionResponse } from "./useQuestionResponse.js";
import { useMemo } from "react";
import type { SubAgentBlock } from "../chatModes/types.js";
import { getActiveThemeName, setTheme, themes } from "../theme.js";

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
  const {
    derivedTurns,
    sendWithOptimisticMessage,
    clearOptimisticMessage,
  } = useOptimisticTranscript(turns, isLoading, currentSessionId, send);

  const inputHistory = useInputHistory(derivedTurns);
  const [inputFocused, setInputFocused] = useState(true);
  const subAgentBlocks = useMemo(
    () => derivedTurns.flatMap((t) => t.blocks).filter((block): block is SubAgentBlock => block.type === "sub-agent"),
    [derivedTurns],
  );
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
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [selectedThemeIndex, setSelectedThemeIndex] = useState(() => {
    const index = Object.keys(themes).indexOf(getActiveThemeName());
    return index >= 0 ? index : 0;
  });
  const [themeRenderKey, setThemeRenderKey] = useState(0);

  const { historyResetKey } = useTranscriptViewportReset(currentSessionId, derivedTurns);

  const toggleToolsExpanded = useCallback(() => {
    setToolsExpanded((expanded) => !expanded);
  }, []);

  const { requestTurnCancel } = useDoubleEscapeCancel(isLoading, cancel);

  const submitRef = useRef<() => void>(() => {});
  const interactionState = buildChatInteractionState({
    turns: derivedTurns,
    chatMode: "input",
    isLoading,
    pendingConfirmation: confirmation.pending,
    pendingQuestion: question.pending,
    activePanelId: panel.activePanelId,
    isPaletteOpen: palette.isOpen || themeModalOpen,
    inputFocused,
    suggestion,
    setInput: inputHistory.setInput,
    setInputFocused,
    submit: () => submitRef.current(),
    cancel,
    toggleMode,
    openSubAgent: () => {},
    subAgentBlocks,
    toolsExpanded,
    toggleToolsExpanded,
    navigateUp: inputHistory.navigateUp,
    navigateDown: inputHistory.navigateDown,
  });

  useEffect(() => {
    if (!interactionState.pending) return;
    setToolsExpanded(false);
  }, [interactionState.pending]);

  const executeCommand = useCallback(async (input: string) => {
    if (input === "/compact" || input.startsWith("/compact ")) {
      clearOptimisticMessage();
    }
    if (input === "/theme" || input.startsWith("/theme ")) {
      const parts = input.trim().split(/\s+/);
      const name = parts[1];
      if (!name) {
        setSelectedThemeIndex(Math.max(0, Object.keys(themes).indexOf(getActiveThemeName())));
        setThemeModalOpen(true);
        return {
          handled: true,
          clearInput: true,
        };
      }
      if (setTheme(name)) {
        setSelectedThemeIndex(Math.max(0, Object.keys(themes).indexOf(name)));
        setThemeRenderKey((key) => key + 1);
        return {
          handled: true,
          message: `Theme set to: ${name}`,
        };
      } else {
        return {
          handled: true,
          message: `Theme '${name}' not found. Available: ${Object.keys(themes).join(", ")}`,
        };
      }
    }
    return executeAgentCommand(input);
  }, [executeAgentCommand, clearOptimisticMessage]);

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

  const themeNames = useMemo(() => Object.keys(themes), []);
  const switchThemeByIndex = useCallback((index: number) => {
    const name = themeNames[index];
    if (!name) return;
    if (setTheme(name)) {
      setSelectedThemeIndex(index);
      setThemeRenderKey((key) => key + 1);
    }
  }, [themeNames]);
  const closeThemeModal = useCallback(() => {
    setThemeModalOpen(false);
  }, []);
  const nextTheme = useCallback(() => {
    const nextIndex = (selectedThemeIndex + 1) % themeNames.length;
    switchThemeByIndex(nextIndex);
  }, [selectedThemeIndex, switchThemeByIndex, themeNames.length]);
  const prevTheme = useCallback(() => {
    const nextIndex = selectedThemeIndex > 0 ? selectedThemeIndex - 1 : themeNames.length - 1;
    switchThemeByIndex(nextIndex);
  }, [selectedThemeIndex, switchThemeByIndex, themeNames.length]);
  const applySelectedTheme = useCallback(() => {
    const name = themeNames[selectedThemeIndex];
    if (!name) return;
    setThemeModalOpen(false);
    command.setCommandResult(`Theme set to: ${name}`);
  }, [command, selectedThemeIndex, themeNames]);

  return {
    command,
    derivedTurns,
    handleSubmit,
    inputHistory,
    interactionState,
    panel,
    palette,
    themeModal: {
      isOpen: themeModalOpen,
      selectedIndex: selectedThemeIndex,
      activeThemeName: getActiveThemeName(),
      next: nextTheme,
      prev: prevTheme,
      apply: applySelectedTheme,
      close: closeThemeModal,
    },
    shouldSubmit,
    inputFocused,
    setInputFocused,
    suggestion,
    toolsExpanded,
    viewportKey: `${currentSessionId ?? "none"}:${historyResetKey}:${getActiveThemeName()}:${themeRenderKey}`,
    mode,
  };
}
