import { randomUUID } from "node:crypto";
import type { Session } from "@excelsior/core";
import { SESSION_CHANGED } from "../events.js";
import type { EventBus } from "../EventBus.js";
import type { EventStore } from "../EventStore.js";
import type { SessionManager } from "../SessionManager.js";
import type { FileHarnessStorage } from "../storage.js";

interface SessionCoordinatorDeps {
  workspaceId: string;
  storage: FileHarnessStorage;
  sessionManager: SessionManager;
  eventStore: EventStore;
  eventBus: EventBus;
  cancel: () => void;
  notify: () => void;
}

export class SessionCoordinator {
  constructor(private readonly deps: SessionCoordinatorDeps) {}

  createSession(title = "Untitled"): Session {
    this.deps.cancel();
    const session = this.deps.sessionManager.createSession(title);
    this.deps.eventStore.clear(session);
    this.deps.eventBus.emit(`run_${randomUUID()}`, SESSION_CHANGED, {
      sessionId: session.id,
      reason: "created",
    }, {
      sessionId: session.id,
    });
    return session;
  }

  async switchSession(sessionId: string): Promise<void> {
    this.deps.cancel();
    const loaded = this.deps.storage.loadSessionFile(this.deps.workspaceId, sessionId);
    if (!loaded.session) return;
    this.deps.sessionManager.currentSessionId = sessionId;
    this.deps.eventStore.replaceEvents(loaded.session, loaded.events ?? []);
    this.deps.sessionManager.refreshSessions();
    this.deps.eventBus.emit(`run_${randomUUID()}`, SESSION_CHANGED, {
      sessionId,
      reason: "switched",
    }, {
      sessionId,
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.deps.cancel();
    this.deps.sessionManager.deleteSession(sessionId);
    if (this.deps.sessionManager.currentSessionId) {
      const loadedEvents = this.deps.storage.loadEvents(
        this.deps.workspaceId,
        this.deps.sessionManager.currentSessionId,
      );
      this.deps.eventStore.replaceEvents(this.deps.sessionManager.currentSession()!, loadedEvents);
      this.deps.eventBus.emit(`run_${randomUUID()}`, SESSION_CHANGED, {
        sessionId: this.deps.sessionManager.currentSessionId,
        reason: "deleted",
      }, {
        sessionId: this.deps.sessionManager.currentSessionId,
      });
    } else {
      this.deps.eventStore.replaceEvents(null, []);
      this.deps.notify();
    }
  }

  async deleteAllSessions(): Promise<void> {
    this.deps.cancel();
    this.deps.sessionManager.deleteAllSessions();
    this.deps.eventStore.replaceEvents(null, []);
    this.deps.notify();
  }

  renameSession(sessionId: string, title: string): void {
    this.deps.sessionManager.renameSession(sessionId, title);
    if (this.deps.sessionManager.currentSessionId === sessionId) {
      this.deps.eventBus.emit(`run_${randomUUID()}`, SESSION_CHANGED, {
        sessionId,
        reason: "renamed",
      }, {
        sessionId,
      });
    } else {
      this.deps.notify();
    }
  }

  ensureSession(firstInput: string): Session {
    const current = this.deps.sessionManager.currentSession();
    if (current) return current;
    const title = firstInput.length > 50 ? `${firstInput.slice(0, 47)}...` : firstInput;
    return this.createSession(title || "Untitled");
  }
}
