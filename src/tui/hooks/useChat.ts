import { useEffect, useRef, useCallback } from "react";
import { useChatHistory } from "./useChatHistory.js";
import { useChatSender } from "./useChatSender.js";
import { projectEventsToAIHistory } from "../../lib/projection/projectEvents.js";
import { type AIHistoryRef } from "./useChatSender.js";
import { type AnyAgentEvent } from "../../lib/eventTypes.js";

export function useChat() {
  const aiHistoryRef = useRef<AIHistoryRef["current"]>([]);

  const onSessionCompleteRef = useRef<
    ((events: AnyAgentEvent[]) => void) | undefined
  >(undefined);

  const { isLoading, sendMessage, cancel, childSessionsMap } = useChatSender(
    aiHistoryRef,
    onSessionCompleteRef,
  );

  const {
    displayBlocks,
    hasMore,
    attachSession,
    loadMore,
    clearMessages,
    persistedEvents,
  } = useChatHistory({ childSessionsMap });

  const onSessionComplete = useCallback((events: AnyAgentEvent[]) => {
    if (events.length === 0) return;
    const newMessages = projectEventsToAIHistory(events);
    if (newMessages.length > 0) {
      aiHistoryRef.current = [...aiHistoryRef.current, ...newMessages];
    }
  }, []);
  onSessionCompleteRef.current = onSessionComplete;
  useEffect(() => {
    aiHistoryRef.current = projectEventsToAIHistory(persistedEvents);
  }, [persistedEvents]);

  const appendSystemMessage = (_content: string) => {};

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
