import type { AgentMessage, Session } from "@excelsior/core";
import {
  computeDisplayBlocks,
  buildAIHistory,
} from "../lib/projection/projectionMerger.js";
import {
  createSubAgentEventSink,
  type SubAgentEventSink,
} from "../lib/runtime/subAgentEventSink.js";
import { SessionManager } from "../sessionManager.js";
import { ChatService } from "./chatService.js";
import type { AgentMode } from "@excelsior/core";
import { AgentManagerRunLifecycle } from "./agentManager/runLifecycle.js";
import { AgentManagerSessionState } from "./agentManager/sessionState.js";
import { subscribeSubAgentNotifications } from "./agentManager/subAgentNotifications.js";
import type {
  AgentManagerOptions,
  AgentSessionService,
  ChatSessionState,
  ChatTurnService,
  SendOptions,
} from "./agentManager/types.js";

export type {
  AgentManagerOptions,
  AgentSessionService,
  ChatSessionState,
  ChatTurnService,
};

export class AgentManager {
  private _listeners = new Set<() => void>();
  private readonly _sessionState: AgentManagerSessionState;
  private readonly _runLifecycle: AgentManagerRunLifecycle;
  private readonly _subAgentEvents: SubAgentEventSink;
  private _subAgentUnsubs: Array<() => void> = [];
  private _notifyTimer: ReturnType<typeof setTimeout> | null = null;

  private _disposed = false;
  private _snapshot: ChatSessionState | null = null;
  private _mode: AgentMode = "plan";

  constructor(workspaceId?: string, options?: AgentManagerOptions) {
    const service = options?.chatService ?? new ChatService();
    const sessionManager =
      options?.sessionManager ?? new SessionManager(workspaceId);

    this._sessionState = new AgentManagerSessionState(sessionManager);
    this._runLifecycle = new AgentManagerRunLifecycle(
      service,
      () => this._notify(),
      (events) => this._sessionState.appendFinalEvents(events),
    );
    this._subAgentEvents = createSubAgentEventSink();

    this._sessionState.loadInitialData();
    this._subAgentUnsubs = subscribeSubAgentNotifications(
      this._subAgentEvents,
      () => this._scheduleNotify(),
    );
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

  send(content: string, options?: SendOptions): void {
    if (this._runLifecycle.isLoading || this._disposed) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    // set the name of this session is the user's first prompt
    const sessionId = this._sessionState.ensureSession(trimmed);
    const history = this._buildAIHistory();

    this._runLifecycle.startTurn(trimmed, {
      history,
      sessionId,
      workspaceId: this._sessionState.workspaceId,
      workspaceRoot: this._sessionState.workspace.rootPath,
      subAgentEvents: this._subAgentEvents,
      displayContent: options?.displayContent,
      silent: options?.silent,
      mode: this._mode,
    });
  }

  async switchSession(sessionId: string): Promise<void> {
    this.cancel();
    this._sessionState.beginSwitchSession(sessionId);
    this._notify();
    await this._sessionState.reloadCurrentSessionEvents();
    this._notify();
  }

  createSession(title?: string): Session {
    const session = this._sessionState.createSession(title);
    this._notify();
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this._sessionState.deleteSession(sessionId);
    this._notify();
  }

  renameSession(sessionId: string, title: string): void {
    this._sessionState.renameSession(sessionId, title);
    this._notify();
  }

  listSessions(): Session[] {
    return this._sessionState.listSessions();
  }

  getCurrentSessionId(): string | null {
    return this._sessionState.currentSessionId;
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

  cancel(): void {
    this._runLifecycle.cancel();
  }

  clear(): void {
    this.cancel();
    this._sessionState.clearViewState();
    this._notify();
  }

  get run() {
    return this._runLifecycle.run;
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

  private _buildAIHistory(): AgentMessage[] {
    return buildAIHistory({
      liveEvents: this._runLifecycle.liveEvents,
      persistedEvents: this._sessionState.persistedEvents,
      childRuns: this._runLifecycle.childRuns,
    });
  }

  private _updateSnapshot(): void {
    this._snapshot = {
      displayBlocks: computeDisplayBlocks({
        liveEvents: this._runLifecycle.liveEvents,
        persistedEvents: this._sessionState.persistedEvents,
        childRuns: this._runLifecycle.childRuns,
      }),
      isLoading: this._runLifecycle.isLoading,
      sessions: this._sessionState.sessions,
      activeRun: this._runLifecycle.run,
      currentSessionId: this._sessionState.currentSessionId,
      workspace: this._sessionState.workspace,
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
