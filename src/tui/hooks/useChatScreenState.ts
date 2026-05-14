import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigation } from "../context/NavigationContext.js";
import { useAgentManager } from "./useAgentManager.js";
import { useKeymap } from "./useKeymap.js";
import { useToolConfirmation } from "./useToolConfirmation.js";
import { useCommandAutocomplete } from "./useCommandAutocomplete.js";
import { postPRComment } from "../../lib/github/ghComment.js";
import { deleteAllSessions } from "../../lib/persistence/eventPersistence.js";
import { useInputHistory } from "./useInputHistory.js";
import { useSubAgentNavigation } from "./useSubAgentNavigation.js";
import { useCommandResult } from "./useCommandResult.js";
import { completeCommandInput } from "../lib/commandSubmission.js";
import { createFeatureRuntimeContext, submitChatInput } from "../lib/chatSubmit.js";
import { appFeatureRegistry } from "../../features/index.js";

export function useChatScreenState() {
  const { navigate, goBack } = useNavigation();

  const {
    state: { displayBlocks, isLoading, sessions, currentSessionId, workspaceRootPath },
    send, cancel, clear,
    switchSession, createSession, deleteSession, renameSession, listSessions,
  } = useAgentManager();

  const { input, setInput, inputRef, resetInput, navigateUp, navigateDown } = useInputHistory(displayBlocks);
  const { chatMode, setChatMode, subAgentIndex, subAgentBlocks, nextSubAgent, prevSubAgent, openSubAgent } = useSubAgentNavigation(displayBlocks);
  const { commandResult, setCommandResult } = useCommandResult(input);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);

  const { pending, approve, approveAll, deny } = useToolConfirmation();

  const suggestion = useCommandAutocomplete(input);

  useEffect(() => {
    if (pending) setChatMode("input");
  }, [pending, setChatMode]);

  const openPanel = useCallback((panelId: string) => {
    setCommandResult(null);
    resetInput();
    setActivePanelId(panelId);
  }, [resetInput, setCommandResult]);

  const closePanel = useCallback(() => setActivePanelId(null), []);

  const featureContext = useMemo(() => createFeatureRuntimeContext({
    navigate,
    goBack,
    setCommandResult,
    clear,
    deleteAllSessions,
    resetInput,
    send,
    postComment: postPRComment,
    switchSession,
    createSession,
    deleteSession,
    renameSession,
    listSessions,
    sessions,
    currentSessionId,
    openPanel,
    closePanel,
    getHelpText: () => appFeatureRegistry.getHelpText(),
  }), [
    navigate,
    goBack,
    setCommandResult,
    clear,
    resetInput,
    send,
    switchSession,
    createSession,
    deleteSession,
    renameSession,
    listSessions,
    sessions,
    currentSessionId,
    openPanel,
    closePanel,
  ]);

  const handleSubmit = useCallback(() => {
    if (isLoading) return;
    const trimmed = inputRef.current.trim();
    if (!trimmed) return;

    submitChatInput({
      input: trimmed,
      isLoading,
      commandContext: featureContext,
      resetInput,
      setInput,
      send,
    });
  }, [
    isLoading,
    featureContext,
    resetInput,
    setInput,
    send,
  ]);

  useKeymap({
    "y": approve,
    "a": approveAll,
    "n": deny,
    "escape": () => { deny(); cancel(); }
  }, { enabled: !!pending, priority: 100 });

  useKeymap({
    "up": () => prevSubAgent(),
    "down": () => nextSubAgent(),
    "escape": () => setChatMode("input"),
    "ctrl+o": () => setChatMode("input"),
  }, { enabled: chatMode === "subagent-detail", priority: 80 });

  useKeymap({
    "up": () => suggestion.prev(),
    "down": () => suggestion.next(),
    "tab": () => {
      const completed = completeCommandInput(suggestion.filtered, suggestion.selectedIndex);
      if (completed) setInput(completed);
    },
  }, { enabled: !activePanelId && chatMode === "input" && suggestion.show && suggestion.filtered.length > 0, priority: 60 });

  useKeymap({
    "escape": () => {
      if (isLoading) cancel();
    },
    "ctrl+o": () => {
      openSubAgent();
    },
    "up": () => navigateUp(),
    "down": () => navigateDown(),
    "return": () => {
      handleSubmit();
    }
  }, { enabled: !pending && !activePanelId && chatMode === "input", priority: 10 });

  const activePanel = activePanelId ? appFeatureRegistry.getPanel(activePanelId) : undefined;

  return {
    input,
    setInput,
    chatMode,
    subAgents: subAgentBlocks,
    subAgentIndex,
    messages: displayBlocks,
    activePanel,
    featureContext,
    isLoading,
    currentSessionId,
    workspaceRootPath,
    pending,
    suggestion,
    handleSubmit,
    commandResult,
  };
}
