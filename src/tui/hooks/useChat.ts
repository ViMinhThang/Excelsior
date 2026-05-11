import { useEffect, useRef, useCallback } from "react";
import { useChatHistory } from "./useChatHistory.js";
import { useChatSender } from "./useChatSender.js";
import { projectEventsToAIHistory } from "../../lib/eventPersistence.js";
import { type AIHistoryRef } from "./useChatSender.js";
import { type AgentEvent } from "../../lib/eventTypes.js";

export function useChat() {
  const aiHistoryRef = useRef<AIHistoryRef["current"]>([]);

  const onSessionCompleteRef = useRef<
    ((events: AgentEvent[]) => void) | undefined
  >(undefined);

  const { isLoading, sendMessage, cancel, childSessionsMap } = useChatSender(
    aiHistoryRef,
    onSessionCompleteRef,
  );

  const {
    displayBlocks,
    hasMore,
    attachSession,
    addSessionEvents,
    loadMore,
    clearMessages,
    persistedEvents,
  } = useChatHistory({ childSessionsMap });

  const onSessionComplete = useCallback((events: AgentEvent[]) => {
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
