import { useCallback, useRef, useState } from "react";
import { createAgent } from "../../agent/agent.js";
import { logError } from "../../db/index.js";
import { streamAgentResponse } from "../../lib/agentStream.js";
import { AgentSession } from "../../lib/agentSession.js";
import { AgentEvent } from "../../lib/eventTypes.js";
import { persistSession, persistEvents } from "../../lib/eventPersistence.js";
import { formatErrorMessage } from "./useChatSenderUtils.js";

export function useChatSender() {
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const currentSessionRef = useRef<AgentSession | null>(null);

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

    const session = new AgentSession();
    currentSessionRef.current = session;

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

    const agent = createAgent();
    const abortController = new AbortController();
    session.abortController = abortController;

    streamAgentResponse(
      agent,
      [{ role: "user", content: trimmed }],
      session,
      abortController.signal,
    )
      .then(() => {
        unsubBus();
        persistEvents(allEvents);
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
        if (currentSessionRef.current === session) currentSessionRef.current = null;
        setIsLoading(false);
      });

    return session;
  }, []);

  return { isLoading, sendMessage, cancel };
}
