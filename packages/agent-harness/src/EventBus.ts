import { randomUUID } from "node:crypto";
import {
  makeHarnessEvent,
  MESSAGE_START,
  MESSAGE_END,
  MESSAGE_UPDATE,
  type HarnessEventType,
  type HarnessEventDataMap,
  type HarnessEventEmitter,
  type AnyHarnessEvent,
} from "./events.js";
import type { Session } from "@excelsior/core";
import type { SessionManager } from "./SessionManager.js";
import type { EventStore } from "./EventStore.js";
import type { ExtensionRegistry } from "./registries.js";

export class EventBus {
  constructor(
    private readonly workspaceId: string,
    private readonly sessionManager: SessionManager,
    private readonly eventStore: EventStore,
    private readonly extensions: ExtensionRegistry,
    private readonly notify: () => void,
    private readonly finalizedRunIds: Set<string>,
  ) {}

  public createEmitter(runId: string, sessionId: string, turnId: string): HarnessEventEmitter {
    return (type, data, options) => this.emit(runId, type, data, {
      sessionId,
      turnId: options?.turnId ?? turnId,
      relatedToolCallId: options?.relatedToolCallId,
      parentEventId: options?.parentEventId,
    });
  }

  public emitUserMessage(input: {
    runId: string;
    turnId: string;
    sessionId: string;
    content: string;
    displayContent: string;
  }): void {
    const message = {
      id: `msg_${randomUUID()}`,
      role: "user" as const,
      content: input.displayContent,
      modelContent: input.content,
    };
    this.emit(input.runId, MESSAGE_START, { message }, {
      sessionId: input.sessionId,
      turnId: input.turnId,
    });
    this.emit(input.runId, MESSAGE_END, { message }, {
      sessionId: input.sessionId,
      turnId: input.turnId,
    });
  }

  public emitAssistantMessage(runId: string, turnId: string, sessionId: string, content: string): void {
    const message = {
      id: `msg_${randomUUID()}`,
      role: "assistant" as const,
      content,
    };
    this.emit(runId, MESSAGE_START, { message }, { sessionId, turnId });
    this.emit(runId, MESSAGE_UPDATE, {
      messageId: message.id,
      role: "assistant",
      delta: content,
      content,
    }, { sessionId, turnId });
    this.emit(runId, MESSAGE_END, { message }, { sessionId, turnId });
  }

  public emit<T extends HarnessEventType>(
    runId: string,
    type: T,
    data: HarnessEventDataMap[T],
    options?: {
      sessionId?: string;
      turnId?: string;
      relatedToolCallId?: string;
      parentEventId?: string;
      causationId?: string;
      correlationId?: string;
    },
  ) {
    if (this.finalizedRunIds.has(runId)) {
      return makeHarnessEvent({
        workspaceId: this.workspaceId,
        sessionId: options?.sessionId ?? this.sessionManager.currentSessionId ?? this.workspaceId,
        runId,
        turnId: options?.turnId,
        sequence: this.eventStore.sequence,
        type,
        data,
        relatedToolCallId: options?.relatedToolCallId,
        parentEventId: options?.parentEventId,
        causationId: options?.causationId,
        correlationId: options?.correlationId,
      });
    }

    const session = options?.sessionId
      ? this.sessionManager.sessions.find((item) => item.id === options.sessionId)
      : this.sessionManager.currentSession();

    if (!session) {
      throw new Error(`Cannot emit event of type ${type} without a valid session.`);
    }

    const causationId = options?.causationId ?? this.eventStore.lastEventId ?? "";
    const correlationId = options?.correlationId ?? runId;
    const event = makeHarnessEvent({
      workspaceId: this.workspaceId,
      sessionId: options?.sessionId ?? session.id,
      runId,
      turnId: options?.turnId,
      sequence: ++this.eventStore.sequence,
      type,
      data,
      relatedToolCallId: options?.relatedToolCallId,
      parentEventId: options?.parentEventId,
      causationId,
      correlationId,
    });
    const storedEvent = event as AnyHarnessEvent;
    const updated = this.eventStore.recordEvent(
      storedEvent,
      session,
      session.id === this.sessionManager.currentSessionId,
    );
    this.sessionManager.sessions = this.sessionManager.sessions.map((item) => item.id === updated.id ? updated : item);
    this.extensions.emit(storedEvent);
    this.notify();
    return event;
  }
}
