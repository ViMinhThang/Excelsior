import { createChannelBus } from "./bus.js";
import {
  AgentEvent,
  AgentEventType,
  AgentEventDataMap,
  makeEvent,
  AnyAgentEvent,
} from "./events.js";
import { RUN_END } from "./eventNames.js";
import { DisposableScope } from "../utils/disposable.js";

export type RunEventMap = {
  event: AnyAgentEvent;
};

export class AgentRun {
  readonly id: string;
  readonly sessionId: string;
  readonly bus = createChannelBus<RunEventMap>();
  readonly parentEventId?: string;
  readonly correlationId: string;

  private _events: AnyAgentEvent[] = [];
  private _snapshot: readonly AnyAgentEvent[] = [];
  private _seq = 0;
  private _lastEventId: string | null = null;
  private _listeners = new Set<() => void>();
  private _aborted = false;
  private _scope = new DisposableScope();
  private _notifyPending = false;
  private _notifyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    sessionId?: string,
    parentEventId?: string,
    correlationId?: string,
    parentSignal?: AbortSignal,
  ) {
    this.id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.sessionId = sessionId ?? this.id;
    this.parentEventId = parentEventId;
    this.correlationId = correlationId ?? this.id;

    if (parentSignal?.aborted) {
      this._scope.abort(parentSignal.reason);
    } else if (parentSignal) {
      const abortFromParent = () => this.cancel(parentSignal.reason);
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
      this._scope.add(() => parentSignal.removeEventListener("abort", abortFromParent));
    }
  }

  get abortSignal(): AbortSignal {
    return this._scope.abortSignal;
  }

  get isCancelled(): boolean {
    return this._aborted;
  }

  emit<T extends AgentEventType>(
    type: T,
    data: AgentEventDataMap[T],
    overrides?: { relatedToolCallId?: string },
  ): void {
    if (this._aborted && type !== RUN_END) return;
    const event = makeEvent(this.id, type, data, this._seq++, {
      parentEventId: this.parentEventId,
      correlationId: this.correlationId,
      causationId: this._lastEventId ?? undefined,
      ...overrides,
    });
    this._lastEventId = event.id;
    Object.freeze(event);
    this._events.push(event as AnyAgentEvent);
    this._snapshot = [...this._events];
    this.bus.emit("event", event as AnyAgentEvent);
    this._notify();
  }

  cancel(reason?: unknown): void {
    if (this._aborted) return;
    this._aborted = true;
    this._scope.abort(reason);
    this._clearNotifyTimer();
  }

  flushNotify(): void {
    if (this._clearNotifyTimer()) {
      for (const listener of this._listeners) {
        listener();
      }
    }
  }

  private _clearNotifyTimer(): boolean {
    if (this._notifyTimer !== null) {
      clearTimeout(this._notifyTimer);
      this._notifyTimer = null;
      this._notifyPending = false;
      return true;
    }
    return false;
  }

  getSnapshot(): readonly AnyAgentEvent[] {
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
