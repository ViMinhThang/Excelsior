import { useChatHistory } from "./useChatHistory.js";
import { useChatSender } from "./useChatSender.js";

export function useChat() {
  const {
    displayBlocks,
    hasMore,
    attachSession,
    loadMore,
    clearMessages,
  } = useChatHistory();

  const { isLoading, sendMessage, cancel } = useChatSender();

  const appendSystemMessage = (_content: string) => {
    // System messages are transient UI notifications, not events
  };

  return {
    displayBlocks,
    isLoading,
    hasMore,
    sendMessage,
    cancel,
    loadMore,
    clearMessages,
    attachSession,
    appendSystemMessage,
  };
}
