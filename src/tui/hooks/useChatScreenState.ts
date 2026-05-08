import { useState, useCallback, useEffect, useRef } from "react";
import { useInput } from "ink";
import { useNavigation } from "../context/NavigationContext.js";
import { handleCommand } from "../../agent/commands/registry.js";
import { useChat } from "./useChat.js";
import { useEvent } from "./useEvent.js";
import { useToolConfirmation } from "./useToolConfirmation.js";
import { useCommandAutocomplete } from "./useCommandAutocomplete.js";
import { useSubAgentListener } from "./useSubAgentListener.js";
import { SubAgentState } from "../../types.js";

function handlePendingInput(input: string, key: any, approve: () => void, deny: () => void, cancel: () => void): boolean {
  if (input === "y" || input === "Y") { approve(); return true; }
  if (input === "n" || input === "N" || key.escape) { deny(); if (key.escape) cancel(); return true; }
  return true;
}

function handleSubAgentInput(key: any, subAgents: SubAgentState[], subAgentIndex: number, setSubAgentIndex: (fn: (prev: number) => number) => void, setChatMode: (mode: "input" | "subagent-detail") => void): boolean {
  if (key.upArrow && subAgents.length > 0) { setSubAgentIndex((prev) => prev > 0 ? prev - 1 : subAgents.length - 1); return true; }
  if (key.downArrow && subAgents.length > 0) { setSubAgentIndex((prev) => prev < subAgents.length - 1 ? prev + 1 : 0); return true; }
  if (key.escape) { setChatMode("input"); return true; }
  return false;
}

function handleSuggestionInput(key: any, suggestion: any, setInput: (val: string) => void): boolean {
  if (key.upArrow) { suggestion.prev(); return true; }
  if (key.downArrow) { suggestion.next(); return true; }
  if (key.return) {
    const cmd = suggestion.filtered[suggestion.selectedIndex];
    if (cmd) { setInput(`/${cmd.name}`); }
    return true;
  }
  return false;
}

export function useChatScreenState() {
  const { navigate, goBack } = useNavigation();
  const [input, setInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalInput, setOriginalInput] = useState("");
  const [subAgents, setSubAgents] = useState<SubAgentState[]>([]);
  const [subAgentIndex, setSubAgentIndex] = useState(0);
  const [chatMode, setChatMode] = useState<"input" | "subagent-detail">("input");

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

  const { pending, approve, deny } = useToolConfirmation();
  const suggestion = useCommandAutocomplete(input);

  useSubAgentListener({
    onSpawned: (agent) => setSubAgents((prev) => [...prev, agent]),
    onOutput: (toolCallId, updates) => setSubAgents((prev) => prev.map((a) => a.toolCallId === toolCallId ? { ...a, ...updates } : a)),
    onDone: (toolCallId, fullOutput) => setSubAgents((prev) => prev.map((a) => a.toolCallId === toolCallId ? { ...a, status: "done" as const, fullOutput } : a)),
  });

  useEffect(() => { if (pending) setChatMode("input"); }, [pending]);

  const handleInput = useEvent((_input: string, key: any) => {
    if (pending) { handlePendingInput(_input, key, approve, deny, cancel); return; }
    if (chatMode === "subagent-detail") { handleSubAgentInput(key, subAgents, subAgentIndex, setSubAgentIndex, setChatMode);
      if (key.ctrl && _input === "o") setChatMode("input"); return; }
    if (suggestion.show && suggestion.filtered.length > 0) { handleSuggestionInput(key, suggestion, setInput); return; }
    if (key.escape && isLoading) cancel();
    if (key.ctrl && _input === "u") loadMore();
    if (key.ctrl && _input === "o" && subAgents.length > 0) { setSubAgentIndex(0); setChatMode("subagent-detail"); return; }
    if (key.upArrow || key.downArrow) {
      const userMessages = messages.filter((m) => m.role === "user").reverse();
      if (key.upArrow) {
        if (historyIndex + 1 < userMessages.length) {
          const newIndex = historyIndex + 1;
          if (historyIndex === -1) setOriginalInput(input);
          setHistoryIndex(newIndex);
          setInput(userMessages[newIndex].content);
        }
      } else if (historyIndex >= 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(newIndex === -1 ? originalInput : userMessages[newIndex].content);
      }
    }
  });

  useInput(handleInput);

  const handleSubmit = useCallback(async () => {
    if (isLoading) return;
    const trimmed = inputRef.current.trim();
    if (!trimmed) return;

    const commandContext = { navigate, goBack, appendMessage: appendSystemMessage, clearMessages };

    const isCommand = await handleCommand(trimmed, commandContext);
    if (isCommand) { setInput(""); return; }

    setInput("");
    setHistoryIndex(-1);
    setOriginalInput("");
    sendMessage(trimmed);
  }, [isLoading, navigate, goBack, sendMessage, appendSystemMessage, clearMessages]);

  return { input, setInput, chatMode, subAgents, subAgentIndex, messages, isLoading, hasMore, loadMore, pending, suggestion, handleSubmit };
}
