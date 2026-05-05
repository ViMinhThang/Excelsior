import { useEffect } from "react";
import { useChatHistory } from "./useChatHistory.js";
import { useChatSender } from "./useChatSender.js";

export function useChat() {
  const {
    messages,
    hasMore,
    append,
    updateById,
    createAndAppend,
    loadMore,
    clearMessages,
  } = useChatHistory();

  const { isLoading, sendMessage, cancel, setCallbacks } = useChatSender();

  useEffect(() => {
    setCallbacks({ messages, append, updateById });
  }, [messages, append, updateById, setCallbacks]);

  const appendSystemMessage = (content: string) => {
    createAndAppend("system", content);
  };

  return {
    messages,
    isLoading,
    hasMore,
    sendMessage,
    cancel,
    loadMore,
    clearMessages,
    appendSystemMessage,
  };
}
