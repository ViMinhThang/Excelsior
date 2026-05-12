import {
  useState,
  useCallback,
  useRef,
  useSyncExternalStore,
  useMemo,
  useEffect,
} from "react";
import { AgentSession } from "../../lib/runtime/agentSession.js";
import { AnyAgentEvent, DisplayBlock, Session } from "../../lib/eventTypes.js";
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

class SubAgentProjectionStore {
  private _version = 0;
  private _listeners = new Set<() => void>();
  private _notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private _unsubs: Array<() => void> = [];

  constructor() {
    this._unsubs.push(subAgentBus.on("spawned", () => this._triggerUpdate()));
    this._unsubs.push(subAgentBus.on("output", () => this._triggerUpdate()));
    this._unsubs.push(subAgentBus.on("done", () => this._triggerUpdate()));
  }

  subscribe(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => {
      this._listeners.delete(cb);
    };
  }

  getSnapshot(): number {
    return this._version;
  }

  dispose(): void {
    for (const unsub of this._unsubs) {
      unsub();
    }
    this._unsubs = [];
    this._listeners.clear();
    if (this._notifyTimer !== null) {
      clearTimeout(this._notifyTimer);
      this._notifyTimer = null;
    }
  }

  private _triggerUpdate(): void {
    if (this._notifyTimer !== null) return;
    this._notifyTimer = setTimeout(() => {
      this._notifyTimer = null;
      this._version++;
      for (const listener of this._listeners) {
        listener();
      }
    }, 0);
  }
}

const EMPTY_EVENTS: readonly AnyAgentEvent[] = [];

export interface UseChatHistoryOptions {
  childSessionsMap?: Map<string, AgentSession>;
}

export function useChatHistory(options?: UseChatHistoryOptions) {
  const totalRef = useRef(0);
  const loadedRef = useRef(0);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [persistedEvents, setPersistedEvents] = useState<AnyAgentEvent[]>([]);

  useEffect(() => {
    const total = getSessionCount();
    totalRef.current = total;

    const initial = loadSessions(PAGE_SIZE, 0);
    loadedRef.current = initial.length;
    setSessions(initial);
    setHasMore(loadedRef.current < total);

    const initialEvents: AnyAgentEvent[] = [];
    for (const session of initial) {
      try {
        initialEvents.push(...loadSessionEvents(session.id));
      } catch {}
    }
    setPersistedEvents(initialEvents);
  }, []);

  const subAgentStoreRef = useRef<SubAgentProjectionStore | null>(null);
  if (!subAgentStoreRef.current)
    subAgentStoreRef.current = new SubAgentProjectionStore();

  useEffect(() => {
    return () => subAgentStoreRef.current?.dispose();
  }, []);

  const [activeSession, setActiveSession] = useState<AgentSession | null>(null);
  const prevSessionRef = useRef<AgentSession | null>(null);

  const subAgentTick = useSyncExternalStore(
    useCallback(
      (cb: () => void) => subAgentStoreRef.current!.subscribe(cb),
      [],
    ),
    useCallback(() => subAgentStoreRef.current!.getSnapshot(), []),
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

  const addSessionEvents = useCallback((events: AnyAgentEvent[]) => {
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

  const displayEvents = useMemo((): AnyAgentEvent[] => {
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
      const moreEvents: AnyAgentEvent[] = [];
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
