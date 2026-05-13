// Invariant: _liveEvents and _persistedEvents are never empty simultaneously
//   during an active run. _liveEvents contains in-flight data;
//   _persistedEvents contains committed data from completed runs.

import { ChatService } from "../../application/chatService.js";
import { AgentRun } from "../../lib/runtime/agentRun.js";
import { AnyAgentEvent } from "../../lib/runtime/events.js";
import { ProjectedBlock } from "../../lib/projection/display.js";
import { Session } from "../../lib/runtime/session.js";
import { RunHandle } from "../../lib/runtime/runOrchestrator.js";
import {
  computeDisplayBlocks,
  buildAIHistory,
} from "../../lib/projection/projectionMerger.js";
import {
  loadSessions,
  loadAllParentEvents,
} from "../../lib/persistence/eventPersistence.js";
import { subAgentBus } from "../../lib/runtime/subAgentBus.js";

export interface ChatSessionState {
  displayBlocks: ProjectedBlock[];
  isLoading: boolean;
  sessions: Session[];
  activeRun: AgentRun | null;
}

export class AgentManager {
  private _listeners = new Set<() => void>();
  private _service = new ChatService();

  private _run: AgentRun | null = null;
  private _childRuns = new Map<string, AgentRun>();
  private _handle: RunHandle | null = null;
  private _isLoading = false;
  private _unsubLive: (() => void) | null = null;

  private _sessions: Session[] = [];
  private _persistedEvents: AnyAgentEvent[] = [];
  private _liveEvents: readonly AnyAgentEvent[] = [];

  private _subAgentUnsubs: Array<() => void> = [];
  private _subAgentNotifyTimer: ReturnType<typeof setTimeout> | null = null;

  private _disposed = false;
  private _snapshot: ChatSessionState | null = null;

  constructor() {
    this._loadInitialSessions();
    this._subscribeSubAgentBus();
    this._updateSnapshot();
  }

  // ─── Public API ───────────────────────────────────────────────

  getSnapshot(): ChatSessionState {
    if (!this._snapshot) {
      this._updateSnapshot();
    }
    return this._snapshot!;
  }

  subscribe(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => {
      this._listeners.delete(cb);
    };
  }

  // ─── Phase orchestration ─────────────────────────────────────

  send(content: string): void {
    if (this._isLoading || this._disposed) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    const history = this._buildAIHistory();

    this._setLoading(true);
    this._childRuns.clear();

    const result = this._service.startRun(trimmed, { history: { current: history } });

    this._attachRun(result.run, result.childRuns, result.handle);

    this._notify();
  }

  private _setLoading(loading: boolean): void {
    this._isLoading = loading;
    if (!loading) {
      this._liveEvents = [];
      this._unsubLive?.();
      this._unsubLive = null;
      this._run = null;
      this._handle = null;
    }
  }

  private _attachRun(
    run: AgentRun,
    childRuns: Map<string, AgentRun>,
    handle: RunHandle,
  ): void {
    this._run = run;
    this._childRuns = childRuns;
    this._handle = handle;

    this._unsubLive?.();
    this._unsubLive = run.subscribe(() => {
      this._liveEvents = run.getSnapshot();
      this._notify();
    });

    handle.done
      .then((events) => {
        if (events.length > 0) {
          this._persistedEvents = [...this._persistedEvents, ...events];
        }
        this._setLoading(false);
        this._notify();
      })
      .catch(() => {
        this._setLoading(false);
        this._notify();
      });
  }

  cancel(): void {
    this._handle?.cancel();
    this._setLoading(false);
    this._notify();
  }

  clear(): void {
    this.cancel();
    this._sessions = [];
    this._persistedEvents = [];
    this._notify();
  }

  get run(): AgentRun | null {
    return this._run;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.cancel();
    for (const unsub of this._subAgentUnsubs) unsub();
    this._subAgentUnsubs = [];
    this._listeners.clear();
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
        this._notify();
      }, 0);
    };

    this._subAgentUnsubs.push(subAgentBus.on("spawned", trigger));
    this._subAgentUnsubs.push(subAgentBus.on("output", trigger));
    this._subAgentUnsubs.push(subAgentBus.on("done", trigger));
  }

  private _buildAIHistory(): Array<{ role: "user" | "assistant" | "system"; content: string }> {
    return buildAIHistory({
      liveEvents: this._liveEvents,
      persistedEvents: this._persistedEvents,
      childRuns: this._childRuns,
    });
  }

  private _updateSnapshot(): void {
    this._snapshot = {
      displayBlocks: computeDisplayBlocks({
        liveEvents: this._liveEvents,
        persistedEvents: this._persistedEvents,
        childRuns: this._childRuns,
      }),
      isLoading: this._isLoading,
      sessions: this._sessions,
      activeRun: this._run,
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
