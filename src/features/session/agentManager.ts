import { ChatService } from "../../application/chatService.js";
import { AgentSession } from "../../lib/runtime/agentSession.js";
import { AnyAgentEvent } from "../../lib/eventTypes.js";
import { DisplayBlock, Session } from "../../lib/eventTypes.js";
import { RunHandle } from "../../lib/runtime/sessionOrchestrator.js";
import {
  groupEventsForDisplay,
  projectEventsToAIHistory,
} from "../../lib/projection/projectEvents.js";
import {
  loadSessions,
  loadSessionEvents,
  loadAllParentEvents,
} from "../../lib/persistence/eventPersistence.js";
import { subAgentBus } from "../../lib/runtime/subAgentBus.js";

export interface AgentState {
  displayBlocks: DisplayBlock[];
  isLoading: boolean;
  sessions: Session[];
  activeSession: AgentSession | null;
}

/**
 * Facade that hides all the wiring between session lifecycle, event projection,
 * persistence, and React subscription.
 *
 * Before this class, consumers had to coordinate:
 *   ChatService + useChatSender + useChatHistory + useChat
 *   + manual attachSession() + manual projection
 *
 * Now: one class, one hook.
 *
 * @see src/features/session/useAgentManager.ts for the React hook wrapper
 * @see src/application/chatService.ts for the underlying orchestration
 */
export class AgentManager {
  private _listeners = new Set<() => void>();
  private _service = new ChatService();

  private _session: AgentSession | null = null;
  private _childSessions = new Map<string, AgentSession>();
  private _handle: RunHandle | null = null;
  private _isLoading = false;
  private _unsubLive: (() => void) | null = null;

  private _sessions: Session[] = [];
  private _persistedEvents: AnyAgentEvent[] = [];
  private _liveEvents: readonly AnyAgentEvent[] = [];

  private _subAgentUnsubs: Array<() => void> = [];
  private _subAgentVersion = 0;
  private _subAgentListeners = new Set<() => void>();
  private _subAgentNotifyTimer: ReturnType<typeof setTimeout> | null = null;

  private _disposed = false;
  private _snapshot: AgentState | null = null;

  constructor() {
    this._loadInitialSessions();
    this._subscribeSubAgentBus();
    this._updateSnapshot();

    /**
     * @see src/agent/review/spawnSubAgent.ts:42,71,105 for where subAgentBus events are emitted
     * @see src/tui/hooks/useChatHistory.ts:110 for where this subscription previously lived
     */
  }

  // ─── Public API ───────────────────────────────────────────────

  getSnapshot(): AgentState {
    if (!this._snapshot) {
      this._updateSnapshot();
    }
    return this._snapshot!;
  }

  /**
   * @param cb React's onStoreChange callback — wired by useSyncExternalStore
   * @returns unsubscribe function
   * @see src/features/session/useAgentManager.ts for the hook that calls subscribe/getSnapshot
   */
  subscribe(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => {
      this._listeners.delete(cb);
    };
  }

  /**
   * Send a chat message and start the agent run.
   *
   * @see src/application/chatService.ts:startRun for the underlying orchestration
   * @see src/lib/runtime/agentStream.ts:37-78 for how stream parts become events
   */
  send(content: string): void {
    if (this._isLoading || this._disposed) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    this._isLoading = true;
    this._childSessions.clear();

    const result = this._service.startRun(trimmed, {
      history: { current: this._buildAIHistory() },
    });

    this._session = result.session;
    this._childSessions = result.childSessions;
    this._handle = result.handle;

    /**
     * Subscribe to the session so every emit triggers re-projection + notify.
     * @see src/lib/runtime/agentSession.ts:_notify for the listener chain
     */
    this._unsubLive?.();
    this._unsubLive = this._session.subscribe(() => {
      this._liveEvents = this._session!.getSnapshot();
      this._notify();
    });

    result.handle.done
      .then((events) => {
        if (events.length > 0) {
          this._persistedEvents = [...this._persistedEvents, ...events];
        }
        this._isLoading = false;
        this._liveEvents = [];
        this._unsubLive?.();
        this._unsubLive = null;
        this._session = null;
        this._handle = null;
        this._notify();
      })
      .catch(() => {
        this._isLoading = false;
        this._liveEvents = [];
        this._unsubLive?.();
        this._unsubLive = null;
        this._session = null;
        this._handle = null;
        this._notify();
      });

    this._notify();
  }

  cancel(): void {
    this._handle?.cancel();
    this._handle = null;
    this._unsubLive?.();
    this._unsubLive = null;
    this._session = null;
    this._liveEvents = [];
    this._isLoading = false;
    this._notify();
  }

  clear(): void {
    this.cancel();
    this._sessions = [];
    this._persistedEvents = [];
    this._notify();
  }

  get session(): AgentSession | null {
    return this._session;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.cancel();
    for (const unsub of this._subAgentUnsubs) unsub();
    this._subAgentUnsubs = [];
    this._listeners.clear();
    this._subAgentListeners.clear();
    if (this._subAgentNotifyTimer !== null) {
      clearTimeout(this._subAgentNotifyTimer);
      this._subAgentNotifyTimer = null;
    }
  }

  // ─── Private ──────────────────────────────────────────────────

  private _loadInitialSessions(): void {
    this._sessions = loadSessions();
    this._persistedEvents = loadAllParentEvents();
  }

  private _subscribeSubAgentBus(): void {
    const trigger = () => {
      if (this._subAgentNotifyTimer !== null) return;
      this._subAgentNotifyTimer = setTimeout(() => {
        this._subAgentNotifyTimer = null;
        this._subAgentVersion++;
        for (const cb of this._subAgentListeners) {
          cb();
        }
        this._notify();
      }, 0);
    };

    /**
     * @see src/agent/review/spawnSubAgent.ts:42 for "spawned" emissions
     * @see src/agent/review/spawnSubAgent.ts:71 for "output" emissions
     * @see src/agent/review/spawnSubAgent.ts:105 for "done" emissions
     */
    this._subAgentUnsubs.push(subAgentBus.on("spawned", trigger));
    this._subAgentUnsubs.push(subAgentBus.on("output", trigger));
    this._subAgentUnsubs.push(subAgentBus.on("done", trigger));
  }

  private _computeDisplayBlocks(): DisplayBlock[] {
    /** @see src/lib/projection/projectEvents.ts:239 groupEventsForDisplay for the projection logic */
    const displayEvents: AnyAgentEvent[] = this._mergeEvents();
    return groupEventsForDisplay(displayEvents, {
      getChildEvents: (childSessionId: string) => {
        const child = this._childSessions.get(childSessionId);
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
    });
  }

  private _mergeEvents(): AnyAgentEvent[] {
    if (this._liveEvents.length === 0) return this._persistedEvents;
    const liveIds = new Set(this._liveEvents.map((e) => e.id));
    const filtered = this._persistedEvents.filter((e) => !liveIds.has(e.id));
    if (filtered.length === this._persistedEvents.length) {
      return [...this._persistedEvents, ...this._liveEvents];
    }
    return [...filtered, ...this._liveEvents];
  }

  private _buildAIHistory(): Array<{ role: "user" | "assistant" | "system"; content: string }> {
    if (this._liveEvents.length > 0) {
      return projectEventsToAIHistory(this._liveEvents);
    }
    return projectEventsToAIHistory(this._persistedEvents);
  }

  private _updateSnapshot(): void {
    this._snapshot = {
      displayBlocks: this._computeDisplayBlocks(),
      isLoading: this._isLoading,
      sessions: this._sessions,
      activeSession: this._session,
    };
  }

  private _notify(): void {
    this._updateSnapshot();
    for (const cb of this._listeners) {
      try {
        cb();
      } catch {}
    }
  }
}
