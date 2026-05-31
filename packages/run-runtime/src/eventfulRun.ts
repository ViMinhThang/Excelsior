import { createChannelBus } from "./bus.js";
import type { Bus, Unsubscribe } from "./bus.js";
import { DisposableScope } from "./disposable.js";
import { AnyRunEvent, makeRunEvent, RunEventOverrides } from "./events.js";
import { generateId } from "./id.js";
import {
  createRunPersistenceTracker,
  type RunPersistenceConfig,
} from "./runPersistence.js";

export type { RunPersistenceConfig };

export type RunEventMap<TEvents extends { [K in keyof TEvents]: unknown }> = {
  event: AnyRunEvent<TEvents>;
};

export interface EventfulRunOptions<TEvents extends { [K in keyof TEvents]: unknown }> {
  idPrefix?: string;
  sessionId?: string;
  parentEventId?: string;
  correlationId?: string;
  parentSignal?: AbortSignal;
  eventVersion?: number;
  terminalEventTypes?: readonly (keyof TEvents & string)[];
  createRunId?: () => string;
  createEventId?: () => string;
  now?: () => Date | string;
}

export interface RunHandle<TEvents extends { [K in keyof TEvents]: unknown }> {
  cancel(reason?: unknown): void;
  readonly completion: Promise<RunCompletion<TEvents>>;
}

export type RunCompletionStatus = "completed" | "cancelled" | "failed";

export type RunCompletion<TEvents extends { [K in keyof TEvents]: unknown }> = {
  status: RunCompletionStatus;
  events: AnyRunEvent<TEvents>[];
  error?: unknown;
  cancelReason?: unknown;
};

export interface RunExecutionContext<TEvents extends { [K in keyof TEvents]: unknown }> {
  run: EventfulRun<TEvents>;
  signal: AbortSignal;
  emit<T extends keyof TEvents & string>(
    type: T,
    data: TEvents[T],
    overrides?: RunEventOverrides,
  ): void;
}

export interface RunConfig<TEvents extends { [K in keyof TEvents]: unknown }> {
  execute(context: RunExecutionContext<TEvents>): Promise<void> | void;
  persist?: RunPersistenceConfig<TEvents>;
  onError?: (error: unknown) => void;
  isAbortError?: (error: unknown) => boolean;
}

export class EventfulRun<TEvents extends { [K in keyof TEvents]: unknown }> {
  readonly id: string;
  readonly sessionId: string;
  readonly bus: Bus<RunEventMap<TEvents>> = createChannelBus<RunEventMap<TEvents>>();
  readonly parentEventId?: string;
  readonly correlationId: string;

  private _events: AnyRunEvent<TEvents>[] = [];
  private _snapshot: readonly AnyRunEvent<TEvents>[] = [];
  private _seq = 0;
  private _lastEventId: string | null = null;
  private _listeners = new Set<() => void>();
  private _aborted = false;
  private _scope = new DisposableScope();
  private _notifyPending = false;
  private _notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private _terminalEventTypes: Set<string>;
  private _eventVersion: number;
  private _createEventId?: () => string;
  private _now?: () => Date | string;

  constructor(options?: EventfulRunOptions<TEvents>) {
    const idPrefix = options?.idPrefix ?? "run";
    this.id = options?.createRunId?.() ?? generateId(idPrefix);
    this.sessionId = options?.sessionId ?? this.id;
    this.parentEventId = options?.parentEventId;
    this.correlationId = options?.correlationId ?? this.id;
    this._terminalEventTypes = new Set(options?.terminalEventTypes ?? []);
    this._eventVersion = options?.eventVersion ?? 1;
    this._createEventId = options?.createEventId;
    this._now = options?.now;

    if (options?.parentSignal?.aborted) {
      this._aborted = true;
      this._scope.abort(options.parentSignal.reason);
    } else if (options?.parentSignal) {
      const parentSignal = options.parentSignal;
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

  emit<T extends keyof TEvents & string>(
    type: T,
    data: TEvents[T],
    overrides?: RunEventOverrides,
  ): void {
    if (this._aborted && !this._terminalEventTypes.has(type)) return;
    const event = makeRunEvent<TEvents, T>(this.id, type, data, this._seq++, {
      eventVersion: this._eventVersion,
      parentEventId: this.parentEventId,
      correlationId: this.correlationId,
      causationId: this._lastEventId ?? undefined,
      createEventId: this._createEventId,
      now: this._now,
      ...overrides,
    });
    this._lastEventId = event.id;
    Object.freeze(event);
    this._events.push(event as AnyRunEvent<TEvents>);
    this._snapshot = [...this._events];
    this.bus.emit("event", event as AnyRunEvent<TEvents>);
    this._scheduleNotify();
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

  getSnapshot(): readonly AnyRunEvent<TEvents>[] {
    return this._snapshot;
  }

  subscribe(onStoreChange: () => void): () => void {
    this._listeners.add(onStoreChange);
    return () => this._listeners.delete(onStoreChange);
  }

  start(config: RunConfig<TEvents>): RunHandle<TEvents> {
    const persistence = createRunPersistenceTracker({
      initialEvents: this.getSnapshot(),
      persist: config.persist,
    });

    const emit: RunExecutionContext<TEvents>["emit"] = (type, data, overrides) => {
      this.emit(type, data, overrides);
    };

    let unsub: Unsubscribe | null = this.bus.on("event", (event) => {
      persistence.record(event);
    });

    const cleanup = (): void => {
      unsub?.();
      unsub = null;
    };

    const finish = async (
      completion: RunCompletion<TEvents>,
    ): Promise<RunCompletion<TEvents>> => {
      await persistence.flush();
      cleanup();
      return completion;
    };

    const getCancelReason = (fallback?: unknown): unknown => {
      return this.abortSignal.aborted ? this.abortSignal.reason : fallback;
    };

    const cancelledCompletion = (fallback?: unknown): RunCompletion<TEvents> => {
      const cancelReason = getCancelReason(fallback);
      return cancelReason === undefined
        ? { status: "cancelled", events: persistence.events }
        : { status: "cancelled", events: persistence.events, cancelReason };
    };

    const isAbortError = (error: unknown): boolean =>
      config.isAbortError?.(error) ??
      (error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("abort")));

    const completion = Promise.resolve()
      .then(() => config.execute({ run: this, signal: this.abortSignal, emit }))
      .then(async () => {
        return finish(
          this.isCancelled
            ? cancelledCompletion()
            : { status: "completed", events: persistence.events },
        );
      })
      .catch(async (error: unknown) => {
        if (isAbortError(error)) {
          return finish(cancelledCompletion(error));
        }

        try {
          config.onError?.(error);
        } catch (handlerError: unknown) {
          return finish({ status: "failed", events: persistence.events, error: handlerError });
        }

        return finish({ status: "failed", events: persistence.events, error });
      });

    return {
      cancel: (reason?: unknown) => {
        this.cancel(reason);
      },
      completion,
    };
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

  private _scheduleNotify(): void {
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
