import type { Session } from "@excelsior/core";
import type { AnyHarnessEvent } from "./events.js";
import type { FileHarnessStorage } from "./storage.js";

export class EventStore {
  public events: AnyHarnessEvent[] = [];
  public sequence = 0;
  public lastEventId?: string;

  constructor(
    private readonly storage: FileHarnessStorage,
    private readonly workspaceId: string,
  ) {}

  clear(session: Session): void {
    this.events = [];
    this.sequence = 0;
    this.lastEventId = undefined;
    this.storage.replaceEvents(this.workspaceId, session, []);
  }

  recordEvent(event: AnyHarnessEvent, session: Session, isActive: boolean): Session {
    if (isActive) {
      this.events.push(event);
    }
    this.sequence = event.sequence;
    this.lastEventId = event.id;
    return this.storage.appendEvent(this.workspaceId, session, event);
  }

  replaceEvents(session: Session | null, events: AnyHarnessEvent[]): void {
    this.events = events;
    this.sequence = events.at(-1)?.sequence ?? 0;
    this.lastEventId = events.at(-1)?.id;
    if (session) {
      this.storage.replaceEvents(this.workspaceId, session, events);
    }
  }
}
