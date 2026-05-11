import { createBus } from "./bus.js";
import { AgentEvent, AgentEventType, makeEvent } from "./eventTypes.js";

export type SessionEventMap = {
  event: AgentEvent;
};

export class AgentSession {
  readonly id: string;
  readonly bus = createBus<SessionEventMap>();
  readonly parentEventId?: string;
  abortController?: AbortController;

  private _events: AgentEvent[] = [];
  private _snapshot: readonly AgentEvent[] = [];
  private _seq = 0;
  private _listeners = new Set<() => void>();
  private _aborted = false;
  private _notifyPending = false;
  private _notifyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(parentEventId?: string) {
    this.id = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.parentEventId = parentEventId;
  }

  get isCancelled(): boolean {
    return this._aborted;
  }

  emit(
    type: AgentEventType,
    data: Record<string, unknown>,
    overrides?: { relatedToolCallId?: string },
  ): AgentEvent {
    if (this._aborted && type !== "session-end") return undefined as unknown as AgentEvent;
    const event = makeEvent(this.id, type, data, this._seq++, {
      parentEventId: this.parentEventId,
      ...overrides,
    });
    Object.freeze(event);
    this._events.push(event);
    this._snapshot = [...this._events];
    this.bus.emit("event", event);
    this._notify();
    return event;
  }

  cancel(): void {
    this._aborted = true;
    this.abortController?.abort();
    if (this._notifyTimer !== null) {
      clearTimeout(this._notifyTimer);
      this._notifyTimer = null;
      this._notifyPending = false;
    }
  }

  flushNotify(): void {
    if (this._notifyTimer !== null) {
      clearTimeout(this._notifyTimer);
      this._notifyTimer = null;
      this._notifyPending = false;
      for (const listener of this._listeners) {
        listener();
      }
    }
  }

  getSnapshot(): readonly AgentEvent[] {
    return this._snapshot;
  }

  subscribe(onStoreChange: () => void): () => void {
    this._listeners.add(onStoreChange);
    return () => this._listeners.delete(onStoreChange);
  }

  private _notify(): void {
    if (this._notifyPending) return;
    this._notifyPending = true;
    this._notifyTimer = setTimeout(() => {
      this._notifyPending = false;
      this._notifyTimer = null;
      for (const listener of this._listeners) {
        listener();
      }
    }, 0);
  }
}
