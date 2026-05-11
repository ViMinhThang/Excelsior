import { useCallback, useRef, useState } from "react";
import { createAgent } from "../../agent/agent.js";
import { createSpawnSubAgentTool } from "../../agent/review/spawnSubAgent.js";
import { logError } from "../../db/index.js";
import { streamAgentResponse } from "../../lib/agentStream.js";
import { AgentSession } from "../../lib/agentSession.js";
import { AgentEvent } from "../../lib/eventTypes.js";
import { persistSession, persistEvents, projectEventsToAIHistory } from "../../lib/eventPersistence.js";
import { formatErrorMessage } from "./useChatSenderUtils.js";

export interface AIHistoryRef {
  current: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}

export function useChatSender(
  historyRef?: AIHistoryRef,
  onSessionComplete?: { current: ((events: AgentEvent[]) => void) | undefined },
) {
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const currentSessionRef = useRef<AgentSession | null>(null);
  const childSessionsMapRef = useRef(new Map<string, AgentSession>());

  const cancel = useCallback(() => {
    currentSessionRef.current?.cancel();
    currentSessionRef.current = null;
  }, []);

  const sendMessage = useCallback((content: string): AgentSession | null => {
    if (isLoadingRef.current) return null;
    const trimmed = content.trim();
    if (!trimmed) return null;

    setIsLoading(true);
    isLoadingRef.current = true;
    childSessionsMapRef.current.clear();

    const session = new AgentSession();
    currentSessionRef.current = session;
    const childSessions = childSessionsMapRef.current;

    const allEvents: AgentEvent[] = [];
    const unsubBus = session.bus.on("event", (event) => {
      if (event.type !== "session-start") {
        allEvents.push(event);
      }
    });

    session.emit("user-input", { content: trimmed });
    persistSession({
      id: session.id,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { userInput: trimmed },
    });

    // Build AI history from previous sessions so the model has memory
    const aiMessages: Array<{ role: string; content: string }> = [];
    if (historyRef?.current) {
      aiMessages.push(...historyRef.current);
    }
    aiMessages.push({ role: "user" as const, content: trimmed });

    const agent = createAgent(undefined, {
      spawnSubAgent: createSpawnSubAgentTool(session, childSessions),
    });
    const abortController = new AbortController();
    session.abortController = abortController;

    streamAgentResponse(
      agent,
      aiMessages,
      session,
      abortController.signal,
    )
      .then(() => {
        unsubBus();
        persistEvents(allEvents);
        onSessionComplete?.current?.(allEvents);
        if (currentSessionRef.current === session) currentSessionRef.current = null;
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        unsubBus();
        const error = err as Error;
        if (error?.name === "AbortError" || error?.message?.includes("abort")) {
          if (currentSessionRef.current === session) currentSessionRef.current = null;
          setIsLoading(false);
          return;
        }
        logError("Agent Error", "[redacted by formatErrorMessage]");
        session.emit("error", { message: formatErrorMessage(error) });
        persistEvents(allEvents);
        onSessionComplete?.current?.(allEvents);
        if (currentSessionRef.current === session) currentSessionRef.current = null;
        setIsLoading(false);
      });

    return session;
  }, []);

  return { isLoading, sendMessage, cancel, childSessionsMap: childSessionsMapRef.current };
}
