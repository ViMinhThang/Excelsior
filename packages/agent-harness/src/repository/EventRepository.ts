import type { Session } from "@excelsior/core";
import type { AnyHarnessEvent } from "../events.js";
import type { StoredSessionFile } from "../types.js";

export interface EventRepository {
  listSessions(workspaceId: string): Session[];
  createSession(workspaceId: string, title?: string, userInput?: string): Session;
  loadSessionFile(workspaceId: string, sessionId: string): Partial<StoredSessionFile>;
  loadEvents(workspaceId: string, sessionId: string): AnyHarnessEvent[];
  appendEvent(workspaceId: string, session: Session, event: AnyHarnessEvent): Session;
  replaceEvents(workspaceId: string, session: Session, events: AnyHarnessEvent[]): void;
  renameSession(workspaceId: string, sessionId: string, title: string): Session | null;
  deleteSession(workspaceId: string, sessionId: string): void;
  deleteAllSessions(workspaceId: string): void;
}
