import type { AnyRunEvent, RunEventOverrides } from "./events.js";
import type { EventfulRun } from "./eventfulRun.js";
import type { Unsubscribe } from "./bus.js";

export interface RunHandle<TEvents extends { [K in keyof TEvents]: unknown }> {
  cancel(): void;
  readonly done: Promise<AnyRunEvent<TEvents>[]>;
}

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
    const pendingWrites: Promise<void>[] = [];

    const emit: RunExecutionContext<TEvents>["emit"] = (type, data, overrides) => {
      run.emit(type, data, overrides);
    };

    const trackWrite = (event: AnyRunEvent<TEvents>): void => {
      if (!config.persist?.write) return;
      const pending = Promise.resolve(config.persist.write(event)).catch((error: unknown) => {
        if (recordFailed) return;
        recordFailed = true;
        config.persist?.onError?.(error, event);
      });
      pendingWrites.push(pending);
    };

    const waitForPendingWrites = async (): Promise<void> => {
      let settled = 0;
      while (settled < pendingWrites.length) {
        const batch = pendingWrites.slice(settled);
        settled = pendingWrites.length;
        await Promise.all(batch);
      }
    };

    let unsub: Unsubscribe | null = run.bus.on("event", (event) => {
      if (shouldRecordEvent(event)) {
        allEvents.push(event);
        trackWrite(event);
      }
    });

    const done = Promise.resolve()
      .then(() => config.execute({ run, signal: run.abortSignal, emit }))
      .then(async () => {
        await waitForPendingWrites();
        unsub?.();
        unsub = null;
        return allEvents;
      })
      .catch(async (error: unknown) => {
        const isAbortError =
          config.isAbortError?.(error) ??
          (error instanceof Error &&
            (error.name === "AbortError" || error.message.includes("abort")));
        if (!isAbortError) {
          config.onError?.(error);
          await waitForPendingWrites();
          unsub?.();
          unsub = null;
          return allEvents;
        }
        unsub?.();
        unsub = null;
        throw error;
      });

    return {
      cancel() {
        run.cancel();
        unsub?.();
        unsub = null;
      },
      done,
    };
  }
}
