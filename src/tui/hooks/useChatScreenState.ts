import { useCallback, useEffect } from "react";
import { useNavigation } from "../context/NavigationContext.js";
import { handleCommand } from "../lib/commands.js";
import { useAgentManager } from "./useAgentManager.js";
import { useKeymap } from "./useKeymap.js";
import { useToolConfirmation } from "./useToolConfirmation.js";
import { useCommandAutocomplete } from "./useCommandAutocomplete.js";
import { postPRComment } from "../../utils/ghComment.js";
import { deleteAllSessions } from "../../lib/persistence/eventPersistence.js";
import { useInputHistory } from "./useInputHistory.js";
import { useSubAgentNavigation } from "./useSubAgentNavigation.js";
import { useCommandResult } from "./useCommandResult.js";

export function useChatScreenState() {
  const { navigate, goBack } = useNavigation();

  const {
    state: { displayBlocks, isLoading, currentSessionId, workspaceRootPath },
    send, cancel, clear,
    switchSession, createSession, deleteSession, renameSession, listSessions,
  } = useAgentManager();

  const { input, setInput, inputRef, resetInput, navigateUp, navigateDown } = useInputHistory(displayBlocks);
  const { chatMode, setChatMode, subAgentIndex, subAgentBlocks, nextSubAgent, prevSubAgent, openSubAgent } = useSubAgentNavigation(displayBlocks);
  const { commandResult, setCommandResult } = useCommandResult(input);

  const { pending, approve, approveAll, deny } = useToolConfirmation();

  const suggestion = useCommandAutocomplete(input);

  useEffect(() => {
    if (pending) setChatMode("input");
  }, [pending]);

  const handleSubmit = useCallback(() => {
    if (isLoading) return;
    const trimmed = inputRef.current.trim();
    if (!trimmed) return;

    const commandContext = {
      navigate,
      goBack,
      appendMessage: (
        _role: "user" | "assistant" | "system",
        content: string,
      ) => {
        setCommandResult(content);
      },
      clearMessages: () => {
        clear();
        setCommandResult(null);
      },
      deleteAllSessions: () => {
        deleteAllSessions();
      },
      send: (content: string) => {
        resetInput();
        send(content);
      },
      postComment: async (prNumber: number, body: string) => {
        return postPRComment(prNumber, body);
      },
      switchSession: (id: string) => switchSession(id),
      createSession: (title?: string) => createSession(title),
      deleteSession: (id: string) => deleteSession(id),
      renameSession: (id: string, title: string) => renameSession(id, title),
      listSessions: () => listSessions(),
      currentSessionId,
    };
    const suggestedCommand = suggestion.filtered[0];
    if (suggestedCommand) {
      handleCommand(
        `/${suggestedCommand.name}`,
        commandContext,
      ).then((isCommand) => {
        if (isCommand) {
          setInput("");
          return;
        }
      });
      return;
    }

    resetInput();

    send(trimmed);
  }, [
    isLoading,
    navigate,
    goBack,
    send,
    clear,
    suggestion,
    resetInput,
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
  }, { enabled: suggestion.show && suggestion.filtered.length > 0, priority: 60 });

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
  }, { enabled: !pending && chatMode === "input", priority: 10 });

  return {
    input,
    setInput,
    chatMode,
    subAgents: subAgentBlocks,
    subAgentIndex,
    messages: displayBlocks,
    isLoading,
    currentSessionId,
    workspaceRootPath,
    pending,
    suggestion,
    handleSubmit,
    commandResult,
  };
}
