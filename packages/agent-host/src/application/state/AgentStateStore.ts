import type { AgentMode, Session, Workspace } from "@excelsior/core";
import type { AgentRun } from "../../runtime/agentRun.js";
import type { AnyAgentEvent } from "../../runtime/events.js";
import { ProjectionPolicy } from "../projection/ProjectionPolicy.js";
import type { ChatSessionState, ProjectionInputState } from "../types.js";
import {
  buildChatSessionSnapshot,
  type AgentSnapshotInput,
} from "./snapshotBuilder.js";

type Listener = () => void;

export interface AgentStateStoreOptions {
  workspace: Workspace;
  mode?: AgentMode;
}

export class AgentStateStore {
  private state: AgentSnapshotInput;
  private listeners = new Set<Listener>();
  private snapshot: ChatSessionState | null = null;

  constructor(
    options: AgentStateStoreOptions,
    private readonly projection: ProjectionPolicy,
  ) {
    this.state = {
      sessions: [],
      persistedEvents: [],
      activeRun: null,
      childRuns: new Map(),
      liveEvents: [],
      isLoading: false,
      currentSessionId: null,
      workspace: options.workspace,
      mode: options.mode ?? "plan",
    };
  }

  getSnapshot(): ChatSessionState {
    this.snapshot ??= buildChatSessionSnapshot(this.state, this.projection);
    return this.snapshot;
  }

  getProjectionInput(): ProjectionInputState {
    return {
      liveEvents: this.state.liveEvents,
      persistedEvents: this.state.persistedEvents,
      childRuns: this.state.childRuns,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get sessions(): Session[] {
    return this.state.sessions;
  }

  get persistedEvents(): AnyAgentEvent[] {
    return this.state.persistedEvents;
  }

  get currentSessionId(): string | null {
    return this.state.currentSessionId;
  }

  get workspace(): Workspace {
    return this.state.workspace;
  }

  get workspaceId(): string {
    return this.state.workspace.id;
  }

  get mode(): AgentMode {
    return this.state.mode;
  }

  get activeRun(): AgentRun | null {
    return this.state.activeRun;
  }

  get childRuns(): Map<string, AgentRun> {
    return this.state.childRuns;
  }

  get liveEvents(): readonly AnyAgentEvent[] {
    return this.state.liveEvents;
  }

  get isLoading(): boolean {
    return this.state.isLoading;
  }

  setSessionState(input: {
    sessions: Session[];
    currentSessionId: string | null;
    workspace?: Workspace;
  }): void {
    this.commit({
      sessions: input.sessions,
      currentSessionId: input.currentSessionId,
      ...(input.workspace ? { workspace: input.workspace } : {}),
    });
  }

  setPersistedEvents(persistedEvents: AnyAgentEvent[]): void {
    this.commit({ persistedEvents });
  }

  appendPersistedEvents(finalEvents: readonly AnyAgentEvent[]): void {
    if (finalEvents.length === 0) return;
    const ids = new Set(finalEvents.map((event) => event.id));
    this.commit({
      persistedEvents: [
        ...this.state.persistedEvents.filter((event) => !ids.has(event.id)),
        ...finalEvents,
      ],
    });
  }

  clearSessionView(): void {
    this.commit({ sessions: [], persistedEvents: [] });
  }

  startRun(run: AgentRun, childRuns: Map<string, AgentRun>): void {
    this.commit({
      activeRun: run,
      childRuns,
      liveEvents: [],
      isLoading: true,
    });
  }

  setLoading(isLoading: boolean): void {
    this.commit({ isLoading });
  }

  setLiveEvents(liveEvents: readonly AnyAgentEvent[]): void {
    this.commit({ liveEvents });
  }

  clearActiveRun(): void {
    this.commit({
      activeRun: null,
      childRuns: new Map(),
      liveEvents: [],
      isLoading: false,
    });
  }

  setMode(mode: AgentMode): void {
    this.commit({ mode });
  }

  toggleMode(): AgentMode {
    const next = this.state.mode === "plan" ? "act" : "plan";
    this.setMode(next);
    return next;
  }

  notifyExternalChange(): void {
    this.invalidateAndNotify();
  }

  dispose(): void {
    this.listeners.clear();
    this.snapshot = null;
  }

  private commit(next: Partial<AgentSnapshotInput>): void {
    this.state = { ...this.state, ...next };
    this.invalidateAndNotify();
  }

  private invalidateAndNotify(): void {
    this.snapshot = null;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
