import type { Unsubscribe } from "./bus.js";
import type { AnyRunEvent } from "./events.js";
import { createRunPersistenceTracker } from "./runPersistence.js";
import type {
  EventfulRun,
  RunConfig,
  RunExecutionContext,
  RunHandle,
  RunCompletion,
} from "./eventfulRun.js";

export class RunRunner {
  static run<TEvents extends { [K in keyof TEvents]: unknown }>(
    run: EventfulRun<TEvents>,
    config: RunConfig<TEvents>,
  ): RunHandle<TEvents> {
    const persistence = createRunPersistenceTracker({
      initialEvents: run.getSnapshot(),
      persist: config.persist,
    });

    const emit: RunExecutionContext<TEvents>["emit"] = (type, data, overrides) => {
      run.emit(type, data, overrides);
    };

    let unsub: Unsubscribe | null = run.bus.on("event", (event) => {
      persistence.record(event as AnyRunEvent<TEvents>);
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
      return run.abortSignal.aborted ? run.abortSignal.reason : fallback;
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
      .then(() => config.execute({ run, signal: run.abortSignal, emit }))
      .then(async () => {
        return finish(
          run.isCancelled
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
        run.cancel(reason);
      },
      completion,
    };
  }
}
