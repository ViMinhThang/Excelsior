import { createChannelBus } from "./bus.js";
import {
  AgentEvent,
  AgentEventType,
  AgentEventDataMap,
  makeEvent,
  AnyAgentEvent,
} from "./events.js";
import { DisposableScope } from "../utils/disposable.js";

export type SessionEventMap = {
  event: AnyAgentEvent;
};

export class AgentSession {
  readonly id: string;
  readonly bus = createChannelBus<SessionEventMap>("session");
  readonly parentEventId?: string;
  readonly correlationId: string;
  abortController?: AbortController;

  private _events: AnyAgentEvent[] = [];
  private _snapshot: readonly AnyAgentEvent[] = [];
  private _seq = 0;
  private _lastEventId: string | null = null;
  private _listeners = new Set<() => void>();
  private _aborted = false;
  private _scope = new DisposableScope();
  private _notifyPending = false;
  private _notifyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(parentEventId?: string, correlationId?: string) {
    this.id = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.parentEventId = parentEventId;
    this.correlationId = correlationId ?? this.id;
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
    if (this._aborted && type !== "session-end") return;
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

  cancel(): void {
    if (this._aborted) return;
    this._aborted = true;
    this.abortController?.abort();
    this._scope.dispose();
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

  getSnapshot(): readonly AnyAgentEvent[] {
    return this._snapshot;
  }

  /**
   * React integration point.
   * @param onStoreChange Callback registered by useSyncExternalStore
   * @see src/features/session/agentManager.ts for the facade that calls this
   * @see src/tui/hooks/useChatHistory.ts:110 for the previous manual wiring
   */
  subscribe(onStoreChange: () => void): () => void {
    this._listeners.add(onStoreChange);
    return () => this._listeners.delete(onStoreChange);
  }

  /**
   * Triggers React re-renders via useSyncExternalStore.
   * Debounced with setTimeout(0) so multiple emits batch into one render.
   * @see src/features/session/agentManager.ts:134 where session.subscribe reads getSnapshot()
   */
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
