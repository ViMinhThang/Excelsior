import { randomUUID } from "node:crypto";
import type { Session } from "@excelsior/core";
import type { AnyHarnessEvent } from "../events.js";
import type { StoredSessionFile } from "../types.js";
import { deriveSession } from "./deriveSession.js";
import type { EventRepository } from "./EventRepository.js";

interface SessionEntry {
  session: Session;
  events: AnyHarnessEvent[];
}

export class InMemoryEventRepository implements EventRepository {
  private readonly sessions = new Map<string, Map<string, SessionEntry>>();

  listSessions(workspaceId: string): Session[] {
    const entries = [...(this.sessions.get(workspaceId)?.values() ?? [])];
    return entries
      .map((entry) => entry.session)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createSession(workspaceId: string, title = "Untitled", userInput = ""): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: `ses_${randomUUID()}`,
      startedAt: now,
      updatedAt: now,
      metadata: { userInput },
      workspaceId,
      title,
    };
    this.ensureWorkspace(workspaceId).set(session.id, { session, events: [] });
    return session;
  }

  loadSessionFile(workspaceId: string, sessionId: string): Partial<StoredSessionFile> {
    const entry = this.entry(workspaceId, sessionId);
    if (!entry) return { events: [] };
    return {
      session: deriveSession(entry.session, entry.events),
      events: [...entry.events],
    };
  }

  loadEvents(workspaceId: string, sessionId: string): AnyHarnessEvent[] {
    return this.entry(workspaceId, sessionId)?.events ?? [];
  }

  appendEvent(workspaceId: string, session: Session, event: AnyHarnessEvent): Session {
    const entry = this.ensureEntry(workspaceId, session);
    entry.events.push(event);
    const updated = deriveSession(entry.session, [event]);
    entry.session = updated;
    return updated;
  }

  replaceEvents(workspaceId: string, session: Session, events: AnyHarnessEvent[]): void {
    const entry = this.ensureEntry(workspaceId, session);
    entry.events = [...events];
    entry.session = deriveSession(session, events, new Date().toISOString());
  }

  renameSession(workspaceId: string, sessionId: string, title: string): Session | null {
    const entry = this.entry(workspaceId, sessionId);
    if (!entry) return null;
    const session = {
      ...entry.session,
      title,
      updatedAt: new Date().toISOString(),
    };
    entry.session = session;
    return session;
  }

  deleteSession(workspaceId: string, sessionId: string): void {
    this.sessions.get(workspaceId)?.delete(sessionId);
  }

  deleteAllSessions(workspaceId: string): void {
    this.sessions.delete(workspaceId);
  }

  private entry(workspaceId: string, sessionId: string): SessionEntry | undefined {
    return this.sessions.get(workspaceId)?.get(sessionId);
  }

  private ensureWorkspace(workspaceId: string): Map<string, SessionEntry> {
    let workspace = this.sessions.get(workspaceId);
    if (!workspace) {
      workspace = new Map();
      this.sessions.set(workspaceId, workspace);
    }
    return workspace;
  }

  private ensureEntry(workspaceId: string, session: Session): SessionEntry {
    const workspace = this.ensureWorkspace(workspaceId);
    let entry = workspace.get(session.id);
    if (!entry) {
      entry = { session, events: [] };
      workspace.set(session.id, entry);
    }
    return entry;
  }
}
