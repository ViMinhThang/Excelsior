import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigation } from "../context/NavigationContext.js";
import { handleCommand } from "../lib/commands.js";
import { useAgentManager } from "../../features/session/useAgentManager.js";
import { useKeymap } from "./useKeymap.js";
import { useToolConfirmation } from "./useToolConfirmation.js";
import { useCommandAutocomplete } from "./useCommandAutocomplete.js";
import { ProjectedBlock } from "../../lib/projection/display.js";
import { postPRComment } from "../../utils/ghComment.js";
import { selectSubAgentBlocks, selectUserBlocks } from "../selectors/chat-selectors.js";

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

  const { state: { displayBlocks, isLoading }, send, cancel, clear } = useAgentManager();

  const [subAgentIndex, setSubAgentIndex] = useState(0);

  const subAgentBlocks = useMemo(
    () => selectSubAgentBlocks(displayBlocks),
    [displayBlocks],
  );

  const nextSubAgent = useCallback(() => {
    setSubAgentIndex((prev) => {
      if (subAgentBlocks.length === 0) return 0;
      return prev < subAgentBlocks.length - 1 ? prev + 1 : 0;
    });
  }, [subAgentBlocks.length]);

  const prevSubAgent = useCallback(() => {
    setSubAgentIndex((prev) => {
      if (subAgentBlocks.length === 0) return 0;
      return prev > 0 ? prev - 1 : subAgentBlocks.length - 1;
    });
  }, [subAgentBlocks.length]);

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
      send: (content: string) => {
        setInput("");
        setHistoryIndex(-1);
        setOriginalInput("");
        send(content);
      },
      postComment: async (prNumber: number, body: string) => {
        return postPRComment(prNumber, body);
      },
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

    setInput("");
    setHistoryIndex(-1);
    setOriginalInput("");

    send(trimmed);
  }, [
    isLoading,
    navigate,
    goBack,
    send,
    clear,
    suggestion,
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
      if (subAgentBlocks.length > 0) {
        setSubAgentIndex(0);
        setChatMode("subagent-detail");
      }
    },
    "up": () => {
      const userBlocks = selectUserBlocks(displayBlocks).reverse();
      if (historyIndex + 1 < userBlocks.length) {
        const newIndex = historyIndex + 1;
        if (historyIndex === -1) setOriginalInput(input);
        setHistoryIndex(newIndex);
        setInput(userBlocks[newIndex].content);
      }
    },
    "down": () => {
      const userBlocks = selectUserBlocks(displayBlocks).reverse();
      if (historyIndex >= 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(newIndex === -1 ? originalInput : userBlocks[newIndex].content);
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
    subAgents: subAgentBlocks,
    subAgentIndex,
    messages: displayBlocks,
    isLoading,
    pending,
    suggestion,
    handleSubmit,
    commandResult,
  };
}
