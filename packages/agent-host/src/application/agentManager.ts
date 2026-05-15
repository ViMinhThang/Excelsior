import type { AgentRun } from "../lib/runtime/agentRun.js";
import type { AnyAgentEvent } from "../lib/runtime/events.js";
import type { ProjectedBlock } from "../lib/projection/display.js";
import type { Session } from "../lib/runtime/session.js";
import type { RunHandle } from "../lib/runtime/runOrchestrator.js";
import {
  computeDisplayBlocks,
  buildAIHistory,
} from "../lib/projection/projectionMerger.js";
import { loadSessionEvents } from "../lib/persistence/eventPersistence.js";
import {
  createSubAgentEventSink,
  SubAgentEventSink,
} from "../lib/runtime/subAgentEventSink.js";
import { SessionManager } from "../sessionManager.js";
import { ChatService } from "./chatService.js";
import type { AgentMode } from "../lib/runtime/agentMode.js";

export interface ChatSessionState {
  displayBlocks: ProjectedBlock[];
  isLoading: boolean;
  sessions: Session[];
  activeRun: AgentRun | null;
  currentSessionId: string | null;
  workspaceRootPath: string;
  mode: AgentMode;
}

export interface AgentManagerOptions {
  chatService?: ChatService;
  sessionManager?: SessionManager;
}

export class AgentManager {
  private _listeners = new Set<() => void>();
  private _service: ChatService;
  private _sessionManager: SessionManager;

  private _run: AgentRun | null = null;
  private _childRuns = new Map<string, AgentRun>();
  private _handle: RunHandle | null = null;
  private _isLoading = false;
  private _unsubLive: (() => void) | null = null;

  private _sessions: Session[] = [];
  private _persistedEvents: AnyAgentEvent[] = [];
  private _liveEvents: readonly AnyAgentEvent[] = [];

  private _subAgentEvents: SubAgentEventSink;
  private _subAgentUnsubs: Array<() => void> = [];
  private _notifyTimer: ReturnType<typeof setTimeout> | null = null;

  private _disposed = false;
  private _snapshot: ChatSessionState | null = null;
  private _mode: AgentMode = "plan";

  constructor(workspaceId?: string, options?: AgentManagerOptions) {
    this._service = options?.chatService ?? new ChatService();
    this._sessionManager =
      options?.sessionManager ?? new SessionManager(workspaceId);
    this._subAgentEvents = createSubAgentEventSink();
    this._loadInitialData();
    this._subscribeSubAgentEvents();
    this._updateSnapshot();
  }

  getSnapshot(): ChatSessionState {
    if (!this._snapshot) this._updateSnapshot();
    return this._snapshot!;
  }

  subscribe(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => {
      this._listeners.delete(cb);
    };
  }

  send(content: string, options?: { displayContent?: string; silent?: boolean }): void {
    if (this._isLoading || this._disposed) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    const sessionId = this._sessionManager.ensureSession();
    this._sessions = this._sessionManager.listSessions();
    const history = this._buildAIHistory();

    this._setLoading(true);
    this._childRuns.clear();

    const result = this._service.startRun(trimmed, {
      history: { current: history },
      sessionId,
      workspaceId: this._sessionManager.getWorkspaceId(),
      subAgentEvents: this._subAgentEvents,
      displayContent: options?.displayContent,
      silent: options?.silent,
      mode: this._mode,
    });

    this._attachRun(result.run, result.childRuns, result.handle);
    this._notify();
  }

  async switchSession(sessionId: string): Promise<void> {
    this.cancel();
    this._sessionManager.switchSession(sessionId);
    this._sessions = this._sessionManager.listSessions();
    this._persistedEvents = [];
    this._notify();
    await this._reloadSessionEvents();
    this._notify();
  }

  createSession(title?: string): Session {
    const session = this._sessionManager.createSession(title);
    this._sessions = this._sessionManager.listSessions();
    this._notify();
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this._sessionManager.deleteSession(sessionId);
    this._sessions = this._sessionManager.listSessions();
    if (this._sessionManager.getCurrentSessionId() === null) {
      this._persistedEvents = [];
    }
    this._notify();
  }

  renameSession(sessionId: string, title: string): void {
    this._sessionManager.renameSession(sessionId, title);
    this._sessions = this._sessionManager.listSessions();
    this._notify();
  }

  listSessions(): Session[] {
    return this._sessionManager.listSessions();
  }

  getCurrentSessionId(): string | null {
    return this._sessionManager.getCurrentSessionId();
  }

  setMode(mode: AgentMode): void {
    this._mode = mode;
    this._notify();
  }

  toggleMode(): AgentMode {
    this._mode = this._mode === "plan" ? "act" : "plan";
    this._notify();
    return this._mode;
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
      .then(async () => {
        // Read the final snapshot directly from the run rather than
        // this._liveEvents.  The run's subscriber is notified via
        // setTimeout(0) (macrotask), but this .then runs as a microtask,
        // so _liveEvents may be one batch behind and missing the final
        // text-delta events.
        const finalEvents = this._run
          ? [...this._run.getSnapshot()]
          : this._liveEvents;
        if (finalEvents.length > 0) {
          const ids = new Set(finalEvents.map((e) => e.id));
          this._persistedEvents = [
            ...this._persistedEvents.filter((e) => !ids.has(e.id)),
            ...finalEvents,
          ];
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
    if (this._notifyTimer !== null) {
      clearTimeout(this._notifyTimer);
      this._notifyTimer = null;
    }
  }

  private _loadInitialData(): void {
    this._sessions = this._sessionManager.listSessions();
  }

  private async _reloadSessionEvents(): Promise<void> {
    const sid = this._sessionManager.getCurrentSessionId();
    this._persistedEvents = sid ? await loadSessionEvents(sid) : [];
  }

  private _subscribeSubAgentEvents(): void {
    this._subAgentUnsubs.push(
      this._subAgentEvents.on("spawned", () => this._scheduleNotify()),
    );
    this._subAgentUnsubs.push(
      this._subAgentEvents.on("output", () => this._scheduleNotify()),
    );
    this._subAgentUnsubs.push(
      this._subAgentEvents.on("done", () => this._scheduleNotify()),
    );
  }

  private _buildAIHistory(): Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }> {
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
      currentSessionId: this._sessionManager.getCurrentSessionId(),
      workspaceRootPath: this._sessionManager.getWorkspaceRootPath(),
      mode: this._mode,
    };
  }

  private _scheduleNotify(): void {
    if (this._notifyTimer !== null) return;
    this._notifyTimer = setTimeout(() => {
      this._notifyTimer = null;
      this._notify();
    }, 0);
  }

  private _notify(): void {
    this._updateSnapshot();
    this._notifyTimer = null;
    for (const cb of this._listeners) {
      try {
        cb();
      } catch (err) {
        process.stderr.write(`agent: listener error: ${err}\n`);
      }
    }
  }
}
