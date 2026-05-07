import { useState, useCallback, useRef } from "react";
import { useInput } from "ink";
import { useNavigation } from "../context/NavigationContext.js";
import { handleCommand } from "../../agent/commands/registry.js";
import { useChat } from "./useChat.js";
import { useEvent } from "./useEvent.js";
import { useToolConfirmation } from "./useToolConfirmation.js";
import { useCommandAutocomplete } from "./useCommandAutocomplete.js";
import { useSubAgentListener } from "./useSubAgentListener.js";
import { SubAgentState } from "../../types.js";

export function useChatScreenState() {
  const { navigate, goBack } = useNavigation();
  const [input, setInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalInput, setOriginalInput] = useState("");
  const [subAgents, setSubAgents] = useState<SubAgentState[]>([]);
  const [subAgentIndex, setSubAgentIndex] = useState(0);
  const [chatMode, setChatMode] = useState<"input" | "subagent-detail">(
    "input",
  );

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

  const onCancel = useEvent(cancel);
  const onLoadMore = useEvent(loadMore);
  const onNavigate = useEvent(navigate);
  const onGoBack = useEvent(goBack);
  const onSendMessage = useEvent(sendMessage);
  const onAppendSystemMessage = useEvent(appendSystemMessage);
  const onClearMessages = useEvent(clearMessages);

  const { pending, approve, deny } = useToolConfirmation();
  const suggestion = useCommandAutocomplete(input);

  useSubAgentListener({
    onSpawned: (agent) => {
      setSubAgents((prev) => [...prev, agent]);
    },
    onOutput: (toolCallId, updates) => {
      setSubAgents((prev) =>
        prev.map((a) =>
          a.toolCallId === toolCallId ? { ...a, ...updates } : a,
        ),
      );
    },
    onDone: (toolCallId, fullOutput) => {
      setSubAgents((prev) =>
        prev.map((a) =>
          a.toolCallId === toolCallId
            ? { ...a, status: "done" as const, fullOutput }
            : a,
        ),
      );
    },
  });

  // Reset to input mode when a tool confirmation prompt appears
  if (pending && chatMode !== "input") {
    setChatMode("input");
  }

  const handleInput = useEvent(
    (
      _input: string,
      key: {
        upArrow: boolean;
        downArrow: boolean;
        escape: boolean;
        ctrl: boolean;
        return: boolean;
      },
    ) => {
      if (pending) {
        if (_input === "y" || _input === "Y") {
          approve();
          return;
        }
        if (_input === "n" || _input === "N" || key.escape) {
          deny();
          if (key.escape) onCancel();
          return;
        }
        return;
      }

      if (chatMode === "subagent-detail") {
        if (key.upArrow && subAgents.length > 0) {
          setSubAgentIndex((prev) =>
            prev > 0 ? prev - 1 : subAgents.length - 1,
          );
          return;
        }
        if (key.downArrow && subAgents.length > 0) {
          setSubAgentIndex((prev) =>
            prev < subAgents.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (key.escape) {
          setChatMode("input");
          return;
        }
        if (key.ctrl && _input === "o" && subAgents.length > 0) {
          setChatMode("input");
          return;
        }
        return;
      }

      if (suggestion.show && suggestion.filtered.length > 0) {
        if (key.upArrow) {
          suggestion.prev();
          return;
        }
        if (key.downArrow) {
          suggestion.next();
          return;
        }
        if (key.return) {
          const cmd = suggestion.filtered[suggestion.selectedIndex];
          if (cmd) {
            const cmdText = `/${cmd.name}`;
            setInput(cmdText);
            inputRef.current = cmdText;
          }
          return;
        }
      }

      if (key.escape && isLoading) {
        onCancel();
      }
      if (key.ctrl && _input === "u") {
        onLoadMore();
      }
      if (key.ctrl && _input === "o" && subAgents.length > 0) {
        setSubAgentIndex(0);
        setChatMode("subagent-detail");
        return;
      }

      if (key.upArrow || key.downArrow) {
        const userMessages = messages
          .filter((m) => m.role === "user")
          .reverse();

        if (key.upArrow) {
          if (historyIndex + 1 < userMessages.length) {
            const newIndex = historyIndex + 1;
            if (historyIndex === -1) {
              setOriginalInput(input);
            }
            setHistoryIndex(newIndex);
            setInput(userMessages[newIndex].content);
          }
        } else if (key.downArrow) {
          if (historyIndex >= 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            if (newIndex === -1) {
              setInput(originalInput);
            } else {
              setInput(userMessages[newIndex].content);
            }
          }
        }
      }
    },
  );

  useInput(handleInput);

  const handleSubmit = useCallback(async () => {
    const trimmed = inputRef.current.trim();
    if (!trimmed) return;

    const commandContext = {
      navigate: onNavigate,
      goBack: onGoBack,
      appendMessage: onAppendSystemMessage,
      clearMessages: onClearMessages,
    };

    const isCommand = await handleCommand(trimmed, commandContext);
    if (isCommand) {
      setInput("");
      return;
    }

    setInput("");
    setHistoryIndex(-1);
    setOriginalInput("");
    await onSendMessage(trimmed);
  }, [
    onNavigate,
    onGoBack,
    onSendMessage,
    onAppendSystemMessage,
    onClearMessages,
  ]);

  return {
    // State
    input,
    setInput,
    chatMode,
    subAgents,
    subAgentIndex,

    // Chat
    messages,
    isLoading,
    hasMore,
    loadMore,

    // UI
    pending,
    suggestion,
    handleSubmit,
  };
}
