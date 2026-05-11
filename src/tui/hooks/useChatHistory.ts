import { useState, useCallback, useRef, useSyncExternalStore, useMemo, useEffect } from "react";
import { AgentSession } from "../../lib/agentSession.js";
import { AgentEvent, DisplayBlock, Session } from "../../lib/eventTypes.js";
import { loadSessions, loadSessionEvents, getSessionCount } from "../../lib/eventPersistence.js";
import { groupEventsForDisplay, ProjectOptions } from "../../lib/projectEvents.js";
import { subAgentBus } from "../../lib/subAgentBus.js";
import { PAGE_SIZE } from "../../types.js";

const EMPTY_EVENTS: readonly AgentEvent[] = [];

export interface UseChatHistoryOptions {
  childSessionsMap?: Map<string, AgentSession>;
}

export function useChatHistory(options?: UseChatHistoryOptions) {
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

  // Live reactivity link for sub-agents: track updates occurring in parallel streams
  const [tick, setTick] = useState(0);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const triggerUpdate = () => {
      if (notifyTimerRef.current !== null) return;
      notifyTimerRef.current = setTimeout(() => {
        notifyTimerRef.current = null;
        setTick((t) => t + 1);
      }, 0);
    };

    const unsub1 = subAgentBus.on("spawned", triggerUpdate);
    const unsub2 = subAgentBus.on("output", triggerUpdate);
    const unsub3 = subAgentBus.on("done", triggerUpdate);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    };
  }, []);

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

  const addSessionEvents = useCallback((events: AgentEvent[]) => {
    if (events.length > 0) {
      setPersistedEvents((prev) => [...prev, ...events]);
    }
  }, []);

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

  const displayEvents = useMemo((): AgentEvent[] => {
    if (liveEvents.length === 0) return persistedEvents;
    const liveIds = new Set(liveEvents.map((e) => e.id));
    const filtered = persistedEvents.filter((e) => !liveIds.has(e.id));
    if (filtered.length === persistedEvents.length) {
      return [...persistedEvents, ...liveEvents];
    }
    return [...filtered, ...liveEvents];
  }, [persistedEvents, liveEvents]);

  const projectOptions = useMemo((): ProjectOptions => {
    const childMap = options?.childSessionsMap;
    return {
      getChildEvents: (childSessionId: string) => {
        const child = childMap?.get(childSessionId);
        if (child) {
          const snapshot = child.getSnapshot();
          if (snapshot.length > 0) return snapshot;
        }
        try {
          return loadSessionEvents(childSessionId);
        } catch {
          return [];
        }
      },
    };
  }, [options?.childSessionsMap]);

  const displayBlocks: DisplayBlock[] = useMemo(
    () => groupEventsForDisplay(displayEvents, projectOptions),
    [displayEvents, projectOptions, tick],
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
    addSessionEvents,
    loadMore,
    clearMessages,
    sessions,
    liveEvents,
    persistedEvents,
  };
}
