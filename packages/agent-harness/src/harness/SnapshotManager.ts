import type { AgentMode, Workspace } from "@excelsior/core";
import type { AnyHarnessEvent } from "../events.js";
import { projectHarnessState, ProjectionCache, type CanonicalReadModel } from "../projection/index.js";
import type { EventStore } from "../events/EventStore.js";
import type { ReflectionRunManager } from "../reflection/ReflectionRunManager.js";
import type { ProviderRegistry } from "../registries/registries.js";
import type { ActiveRunManager } from "../run/ActiveRunManager.js";
import type { SessionManager } from "./SessionManager.js";
import type { HarnessSnapshot } from "../types.js";
import type { ConfirmationCoordinator } from "./ConfirmationCoordinator.js";

interface SnapshotManagerDeps {
  providers: ProviderRegistry;
  eventStore: EventStore;
  sessionManager: SessionManager;
  workspace: Workspace;
  activeRun: ActiveRunManager;
  confirmations: ConfirmationCoordinator;
  reflectionRun: ReflectionRunManager;
  getMode: () => AgentMode;
}

export class SnapshotManager {
  private readonly projectionCache = new ProjectionCache();
  private readonly listeners = new Set<() => void>();
  private snapshot!: HarnessSnapshot;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: SnapshotManagerDeps) {
    this.updateSnapshot();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): HarnessSnapshot {
    this.flushPendingSnapshot();
    return this.snapshot;
  }

  project(events: readonly AnyHarnessEvent[]): CanonicalReadModel {
    return this.projectionCache.project(events);
  }

  notify(): void {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.flushNotify();
    }, 0);
  }

  notifyNow(): void {
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    this.flushNotify();
  }

  dispose(): void {
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    this.listeners.clear();
  }

  private updateSnapshot(): void {
    const provider = this.deps.providers.get();
    this.snapshot = projectHarnessState({
      events: this.deps.eventStore.events,
      readModel: this.projectionCache.project(this.deps.eventStore.events),
      isLoading: this.deps.activeRun.isActive(),
      sessions: this.deps.sessionManager.sessions,
      currentSessionId: this.deps.sessionManager.currentSessionId,
      workspace: this.deps.workspace,
      llm: {
        providerName: provider.displayName,
        modelName: provider.modelId,
      },
      mode: this.deps.activeRun.currentIdentity()?.mode ?? this.deps.getMode(),
      pendingConfirmation: this.deps.confirmations.pendingConfirmation,
      pendingQuestion: this.deps.confirmations.pendingQuestion,
      reflection: this.deps.reflectionRun.snapshot(),
    });
  }

  private flushPendingSnapshot(): void {
    if (!this.notifyTimer) return;
    clearTimeout(this.notifyTimer);
    this.notifyTimer = null;
    this.updateSnapshot();
  }

  private flushNotify(): void {
    this.updateSnapshot();
    for (const listener of this.listeners) listener();
  }
}
