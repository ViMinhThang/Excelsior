import { useState, useCallback, useRef, useSyncExternalStore, useMemo } from "react";
import { AgentSession } from "../../lib/agentSession.js";
import { AgentEvent, DisplayBlock, Session } from "../../lib/eventTypes.js";
import { loadSessions, loadSessionEvents, getSessionCount } from "../../lib/eventPersistence.js";
import { groupEventsForDisplay } from "../../lib/projectEvents.js";
import { PAGE_SIZE } from "../../types.js";

const EMPTY_EVENTS: readonly AgentEvent[] = [];

export function useChatHistory() {
  const totalRef = useRef(getSessionCount());
  const loadedRef = useRef(0);

  const [sessions, setSessions] = useState<Session[]>(() => {
    const initial = loadSessions(PAGE_SIZE, 0);
    loadedRef.current = initial.length;
    return initial;
  });

  const [hasMore, setHasMore] = useState(
    () => loadedRef.current < totalRef.current,
  );

  const [persistedEvents, setPersistedEvents] = useState<AgentEvent[]>(() => {
    const all: AgentEvent[] = [];
    for (const session of sessions) {
      const evts = loadSessionEvents(session.id);
      all.push(...evts);
    }
    return all;
  });

  const [activeSession, setActiveSession] = useState<AgentSession | null>(null);
  const prevSessionRef = useRef<AgentSession | null>(null);

  const liveEvents = useSyncExternalStore(
    useCallback(
      (cb: () => void) => {
        if (!activeSession) return () => {};
        return activeSession.subscribe(cb);
      },
      [activeSession],
    ),
    useCallback(() => {
      if (!activeSession) return EMPTY_EVENTS;
      return activeSession.getSnapshot();
    }, [activeSession]),
  );

  const attachSession = useCallback((newSession: AgentSession | null) => {
    const oldSession = prevSessionRef.current;
    if (oldSession && oldSession !== newSession) {
      const events = oldSession.getSnapshot();
      if (events.length > 0) {
        setPersistedEvents((prev) => [...prev, ...events]);
      }
    }
    prevSessionRef.current = newSession;
    setActiveSession(newSession);
  }, []);

  // Deduplicate: events from activeSession's snapshot might also be in persistedEvents
  // if the session was completed and persisted. Filter them out.
  const displayEvents = useMemo((): AgentEvent[] => {
    if (liveEvents.length === 0) return persistedEvents;
    const liveIds = new Set(liveEvents.map((e) => e.id));
    const filtered = persistedEvents.filter((e) => !liveIds.has(e.id));
    if (filtered.length === persistedEvents.length) {
      return [...persistedEvents, ...liveEvents];
    }
    return [...filtered, ...liveEvents];
  }, [persistedEvents, liveEvents]);

  const displayBlocks: DisplayBlock[] = useMemo(
    () => groupEventsForDisplay(displayEvents),
    [displayEvents],
  );

  const loadMore = useCallback((count: number = PAGE_SIZE) => {
    const older = loadSessions(count, loadedRef.current);
    if (older.length > 0) {
      loadedRef.current += older.length;
      totalRef.current = getSessionCount();
      setHasMore(loadedRef.current < totalRef.current);
      setSessions((prev) => [...prev, ...older]);
      const moreEvents: AgentEvent[] = [];
      for (const session of older) {
        const evts = loadSessionEvents(session.id);
        moreEvents.push(...evts);
      }
      if (moreEvents.length > 0) {
        setPersistedEvents((prev) => [...moreEvents, ...prev]);
      }
    }
  }, []);

  const clearMessages = useCallback(() => {
    setSessions([]);
    setPersistedEvents([]);
    setActiveSession(null);
    loadedRef.current = 0;
    totalRef.current = 0;
    setHasMore(false);
  }, []);

  return {
    displayBlocks,
    hasMore,
    attachSession,
    loadMore,
    clearMessages,
    sessions,
    liveEvents,
    persistedEvents,
  };
}
