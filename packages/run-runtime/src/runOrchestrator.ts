import type { AnyRunEvent, RunEventOverrides } from "./events.js";
import type { EventfulRun } from "./eventfulRun.js";
import type { Unsubscribe } from "./bus.js";

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

export interface RunPersistenceConfig<TEvents extends { [K in keyof TEvents]: unknown }> {
  filter?: (event: AnyRunEvent<TEvents>) => boolean;
  write?: (event: AnyRunEvent<TEvents>) => Promise<void> | void;
  onError?: (error: unknown, event: AnyRunEvent<TEvents>) => void;
}

export interface RunConfig<TEvents extends { [K in keyof TEvents]: unknown }> {
  execute(context: RunExecutionContext<TEvents>): Promise<void> | void;
  persist?: RunPersistenceConfig<TEvents>;
  onError?: (error: unknown) => void;
  isAbortError?: (error: unknown) => boolean;
}

export class RunOrchestrator<TEvents extends { [K in keyof TEvents]: unknown }> {
  start(run: EventfulRun<TEvents>, config: RunConfig<TEvents>): RunHandle<TEvents> {
    const shouldRecordEvent = config.persist?.filter ?? (() => true);
    const allEvents = run.getSnapshot().filter(shouldRecordEvent);
    let recordFailed = false;
    let writeQueue: Promise<void> = Promise.resolve();

    const emit: RunExecutionContext<TEvents>["emit"] = (type, data, overrides) => {
      run.emit(type, data, overrides);
    };

    const notifyPersistError = (error: unknown, event: AnyRunEvent<TEvents>): void => {
      if (recordFailed) return;
      recordFailed = true;
      try {
        config.persist?.onError?.(error, event);
      } catch {
        // Persistence error handlers are diagnostic hooks; they should not break run cleanup.
      }
    };

    const trackWrite = (event: AnyRunEvent<TEvents>): void => {
      if (!config.persist?.write) return;
      const write = config.persist.write;
      writeQueue = writeQueue.then(async () => {
        try {
          await write(event);
        } catch (error: unknown) {
          notifyPersistError(error, event);
        }
      });
    };

    const waitForPendingWrites = async (): Promise<void> => {
      let observedQueue: Promise<void>;
      do {
        observedQueue = writeQueue;
        await observedQueue;
      } while (observedQueue !== writeQueue);
    };

    let unsub: Unsubscribe | null = run.bus.on("event", (event) => {
      if (shouldRecordEvent(event)) {
        allEvents.push(event);
        trackWrite(event);
      }
    });

    const cleanup = (): void => {
      unsub?.();
      unsub = null;
    };

    const finish = async (
      completion: RunCompletion<TEvents>,
    ): Promise<RunCompletion<TEvents>> => {
      await waitForPendingWrites();
      cleanup();
      return completion;
    };

    const getCancelReason = (fallback?: unknown): unknown => {
      return run.abortSignal.aborted ? run.abortSignal.reason : fallback;
    };

    const cancelledCompletion = (fallback?: unknown): RunCompletion<TEvents> => {
      const cancelReason = getCancelReason(fallback);
      return cancelReason === undefined
        ? { status: "cancelled", events: allEvents }
        : { status: "cancelled", events: allEvents, cancelReason };
    };

    const isAbortError = (error: unknown): boolean =>
      config.isAbortError?.(error) ??
      (error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("abort")));

    const completion = Promise.resolve()
      .then(() => config.execute({ run, signal: run.abortSignal, emit }))
      .then(async () => {
        return finish(
          run.isCancelled
            ? cancelledCompletion()
            : { status: "completed", events: allEvents },
        );
      })
      .catch(async (error: unknown) => {
        if (isAbortError(error)) {
          return finish(cancelledCompletion(error));
        }

        try {
          config.onError?.(error);
        } catch (handlerError: unknown) {
          return finish({ status: "failed", events: allEvents, error: handlerError });
        }

        return finish({ status: "failed", events: allEvents, error });
      });

    return {
      cancel(reason?: unknown) {
        run.cancel(reason);
      },
      completion,
    };
  }
}
