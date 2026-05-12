import {
  useState,
  useCallback,
  useRef,
  useSyncExternalStore,
  useMemo,
  useEffect,
} from "react";
import { AgentSession } from "../../lib/runtime/agentSession.js";
import { AgentEvent, DisplayBlock, Session } from "../../lib/eventTypes.js";
import {
  loadSessions,
  loadSessionEvents,
  getSessionCount,
} from "../../lib/persistence/eventPersistence.js";
import {
  groupEventsForDisplay,
  ProjectOptions,
} from "../../lib/projection/projectEvents.js";
import { subAgentBus } from "../lib/subAgentBus.js";
import { PAGE_SIZE } from "../../types.js";

// Extracted robust notification store for sub-agents to replace inline component tick hacks.
let _subAgentVersion = 0;
const _subAgentListeners = new Set<() => void>();
let _subAgentNotifyTimer: ReturnType<typeof setTimeout> | null = null;

const triggerSubAgentUpdate = () => {
  if (_subAgentNotifyTimer !== null) return;
  _subAgentNotifyTimer = setTimeout(() => {
    _subAgentNotifyTimer = null;
    _subAgentVersion++;
    for (const listener of _subAgentListeners) {
      listener();
    }
  }, 0);
};

subAgentBus.on("spawned", triggerSubAgentUpdate);
subAgentBus.on("output", triggerSubAgentUpdate);
subAgentBus.on("done", triggerSubAgentUpdate);

const subAgentStore = {
  subscribe: (cb: () => void) => {
    _subAgentListeners.add(cb);
    return () => {
      _subAgentListeners.delete(cb);
    };
  },
  getSnapshot: () => _subAgentVersion,
};

const EMPTY_EVENTS: readonly AgentEvent[] = [];

export interface UseChatHistoryOptions {
  childSessionsMap?: Map<string, AgentSession>;
}

export function useChatHistory(options?: UseChatHistoryOptions) {
  const totalRef = useRef(0);
  const loadedRef = useRef(0);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [persistedEvents, setPersistedEvents] = useState<AgentEvent[]>([]);

  // Initial fetch deferred from state instantiation to ensure UI doesn't block
  useEffect(() => {
    const total = getSessionCount();
    totalRef.current = total;

    const initial = loadSessions(PAGE_SIZE, 0);
    loadedRef.current = initial.length;
    setSessions(initial);
    setHasMore(loadedRef.current < total);

    const initialEvents: AgentEvent[] = [];
    for (const session of initial) {
      try {
        initialEvents.push(...loadSessionEvents(session.id));
      } catch {}
    }
    setPersistedEvents(initialEvents);
  }, []);

  const [activeSession, setActiveSession] = useState<AgentSession | null>(null);
  const prevSessionRef = useRef<AgentSession | null>(null);

  const subAgentTick = useSyncExternalStore(
    subAgentStore.subscribe,
    subAgentStore.getSnapshot,
  );

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
    [displayEvents, projectOptions, subAgentTick],
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
