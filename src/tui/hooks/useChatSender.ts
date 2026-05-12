import { useCallback, useRef, useState } from "react";
import { createAgent } from "../../agent/agent.js";
import { createSpawnSubAgentTool } from "../../agent/review/spawnSubAgent.js";
import { SessionOrchestrator } from "../../lib/runtime/sessionOrchestrator.js";
import { AgentSession } from "../../lib/runtime/agentSession.js";
import { AgentEvent } from "../../lib/eventTypes.js";
import { persistSession, persistEvents } from "../../lib/persistence/eventPersistence.js";
import { projectEventsToAIHistory } from "../../lib/projection/projectEvents.js";
import { confirmBus } from "../lib/confirmBus.js";

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
  const orchestratorRef = useRef<SessionOrchestrator | null>(null);
  if (!orchestratorRef.current) orchestratorRef.current = new SessionOrchestrator();

  const cancel = useCallback(() => {
    orchestratorRef.current?.cancel();
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

    // Build AI history from previous sessions so the model has memory
    const aiMessages: Array<{ role: string; content: string }> = [];
    if (historyRef?.current) {
      aiMessages.push(...historyRef.current);
    }
    aiMessages.push({ role: "user" as const, content: trimmed });

    const abortController = new AbortController();
    session.abortController = abortController;

    session.emit("user-input", { content: trimmed });
    persistSession({
      id: session.id,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { userInput: trimmed },
    });

    const { onComplete } = orchestratorRef.current!.startRun(session, {
      messages: aiMessages,
      createAgent: () => createAgent(undefined, {
        spawnSubAgent: createSpawnSubAgentTool(session, childSessions),
      }, confirmBus),
      signal: abortController.signal,
    });

    onComplete
      .then((events) => {
        persistEvents(events);
        onSessionComplete?.current?.(events);
        if (currentSessionRef.current === session) currentSessionRef.current = null;
        setIsLoading(false);
      })
      .catch(() => {
        // AbortError only — orchestrator handles non-abort errors internally
        if (currentSessionRef.current === session) currentSessionRef.current = null;
        setIsLoading(false);
      });

    return session;
  }, []);

  return { isLoading, sendMessage, cancel, childSessionsMap: childSessionsMapRef.current };
}
