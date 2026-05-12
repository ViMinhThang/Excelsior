import { useCallback, useRef, useState } from "react";
import { ChatService, AIHistoryRef } from "../../application/chatService.js";
import { AgentSession } from "../../lib/runtime/agentSession.js";
import { AnyAgentEvent } from "../../lib/eventTypes.js";

export { type AIHistoryRef } from "../../application/chatService.js";

export function useChatSender(
  historyRef?: AIHistoryRef,
  onSessionComplete?: { current: ((events: AnyAgentEvent[]) => void) | undefined },
) {
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const currentSessionRef = useRef<AgentSession | null>(null);
  const childSessionsMapRef = useRef(new Map<string, AgentSession>());
  const serviceRef = useRef<ChatService | null>(null);
  if (!serviceRef.current) serviceRef.current = new ChatService();

  const cancel = useCallback(() => {
    currentSessionRef.current?.cancel();
    currentSessionRef.current = null;
    setIsLoading(false);
  }, []);

  const sendMessage = useCallback((content: string): AgentSession | null => {
    if (isLoadingRef.current) return null;
    const trimmed = content.trim();
    if (!trimmed) return null;

    setIsLoading(true);
    isLoadingRef.current = true;
    childSessionsMapRef.current.clear();

    const { session, childSessions } = serviceRef.current!.startRun(trimmed, {
      history: historyRef,
      onComplete: (events) => onSessionComplete?.current?.(events),
    });

    currentSessionRef.current = session;
    childSessionsMapRef.current = childSessions;

    session.abortController?.signal.addEventListener("abort", () => {
      if (currentSessionRef.current === session) currentSessionRef.current = null;
      setIsLoading(false);
    });

    return session;
  }, []);

  return { isLoading, sendMessage, cancel, childSessionsMap: childSessionsMapRef.current };
}
