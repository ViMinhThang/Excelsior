import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigation } from "../context/NavigationContext.js";
import { handleCommand } from "../../agent/commands/registry.js";
import { useChat } from "./useChat.js";
import { useKeymap } from "./useKeymap.js";
import { useToolConfirmation } from "./useToolConfirmation.js";
import { useCommandAutocomplete } from "./useCommandAutocomplete.js";
import { useManagedSubAgents } from "./useManagedSubAgents.js";
import { SubAgentState } from "../../types.js";



export function useChatScreenState() {
  const { navigate, goBack } = useNavigation();
  const [input, setInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalInput, setOriginalInput] = useState("");

  const [chatMode, setChatMode] = useState<"input" | "subagent-detail">(
    "input",
  );
  const [commandResult, setCommandResult] = useState<string | null>(null);

  useEffect(() => {
    if (input) {
      setCommandResult(null);
    }
  }, [input]);

  const inputRef = useRef(input);
  inputRef.current = input;

  const {
    messages,
    isLoading,
    hasMore,
    sendMessage,
    cancel,
    loadMore,
    clearMessages,
    appendSystemMessage,
  } = useChat();

  const { pending, approve, approveAll, deny } = useToolConfirmation();

  const {
    subAgents,
    subAgentIndex,
    setSubAgentIndex,
    nextSubAgent,
    prevSubAgent
  } = useManagedSubAgents();

  const suggestion = useCommandAutocomplete(input);

  useEffect(() => {
    if (pending) setChatMode("input");
  }, [pending]);

  const handleSubmit = useCallback(async () => {
    if (isLoading) return;
    const trimmed = inputRef.current.trim();
    if (!trimmed) return;

    const commandContext = {
      navigate,
      goBack,
      appendMessage: (
        role: "user" | "assistant" | "system",
        content: string,
      ) => {
        appendSystemMessage(content);
        setCommandResult(content);
      },
      clearMessages: () => {
        clearMessages();
        setCommandResult(null);
      },
    };
    const suggestedCommand = suggestion.filtered[0];
    if (suggestedCommand) {
      const isCommand = await handleCommand(
        `/${suggestedCommand.name}`,
        commandContext,
      );
      if (isCommand) {
        setInput("");
        return;
      }
    }

    setInput("");
    setHistoryIndex(-1);
    setOriginalInput("");
    sendMessage(trimmed);
  }, [
    isLoading,
    navigate,
    goBack,
    sendMessage,
    appendSystemMessage,
    clearMessages,
    suggestion, // FIXED: satisfied missing dependency
  ]);

  // --- Keymapping Mini-Framework Config ---

  // Layer 1: Blocking Authorization Mode
  useKeymap({
    "y": approve,
    "a": approveAll,
    "n": deny,
    "escape": () => { deny(); cancel(); }
  }, { enabled: !!pending, priority: 100 });

  // Layer 2: Inspecting SubAgent Activity Log
  useKeymap({
    "up": () => prevSubAgent(),
    "down": () => nextSubAgent(),
    "escape": () => setChatMode("input"),
    "ctrl+o": () => setChatMode("input"),
  }, { enabled: chatMode === "subagent-detail", priority: 80 });

  // Layer 3: Command Completion Mode
  // NOTE: High Priority (60) intentionally hijacks arrow keys from Layer 4 when menu is active
  useKeymap({
    "up": () => suggestion.prev(),
    "down": () => suggestion.next(),
  }, { enabled: suggestion.show && suggestion.filtered.length > 0, priority: 60 });

  // Layer 4: Global & Text Input Navigation Mode
  useKeymap({
    "escape": () => {
      if (isLoading) cancel();
    },
    "ctrl+u": () => loadMore(),
    "ctrl+o": () => {
      if (subAgents.length > 0) {
        setSubAgentIndex(0);
        setChatMode("subagent-detail");
      }
    },
    "up": () => {
      const userMessages = messages.filter((m) => m.role === "user").reverse();
      if (historyIndex + 1 < userMessages.length) {
        const newIndex = historyIndex + 1;
        if (historyIndex === -1) setOriginalInput(input);
        setHistoryIndex(newIndex);
        setInput(userMessages[newIndex].content);
      }
    },
    "down": () => {
      const userMessages = messages.filter((m) => m.role === "user").reverse();
      if (historyIndex >= 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(newIndex === -1 ? originalInput : userMessages[newIndex].content);
      }
    },
    "return": () => {
      handleSubmit();
    }
  }, { enabled: !pending && chatMode === "input", priority: 10 });



  return {
    input,
    setInput,
    chatMode,
    subAgents,
    subAgentIndex,
    messages,
    isLoading,
    hasMore,
    loadMore,
    pending,
    suggestion,
    handleSubmit,
    commandResult,
  };
}
