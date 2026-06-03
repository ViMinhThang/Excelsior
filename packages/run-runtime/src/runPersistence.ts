import type { AnyRunEvent } from "./events.js";

export interface RunPersistenceConfig<TEvents extends { [K in keyof TEvents]: unknown }> {
  filter?: (event: AnyRunEvent<TEvents>) => boolean;
  write?: (event: AnyRunEvent<TEvents>) => Promise<void> | void;
  onError?: (error: unknown, event: AnyRunEvent<TEvents>) => void;
}

export interface RunPersistenceTracker<TEvents extends { [K in keyof TEvents]: unknown }> {
  readonly events: AnyRunEvent<TEvents>[];
  record(event: AnyRunEvent<TEvents>): void;
  flush(): Promise<void>;
}

export function createRunPersistenceTracker<TEvents extends { [K in keyof TEvents]: unknown }>({
  initialEvents,
  persist,
}: {
  initialEvents: readonly AnyRunEvent<TEvents>[];
  persist?: RunPersistenceConfig<TEvents>;
}): RunPersistenceTracker<TEvents> {
  const shouldRecordEvent = persist?.filter ?? (() => true);
  const events = initialEvents.filter(shouldRecordEvent);
  let recordFailed = false;
  let writeQueue: Promise<void> = Promise.resolve();

  const notifyPersistError = (error: unknown, event: AnyRunEvent<TEvents>): void => {
    if (recordFailed) return;
    recordFailed = true;
    try {
      persist?.onError?.(error, event);
    } catch {
    }
  };
  // make sure all the event all sequential
  // runRecorder handle this , but to make sure this not rely on runRecorder
  const trackWrite = (event: AnyRunEvent<TEvents>): void => {
    if (!persist?.write) return;
    const write = persist.write;
    writeQueue = writeQueue.then(async () => {
      try {
        await write(event);
      } catch (error: unknown) {
        notifyPersistError(error, event);
      }
    });
  };

  return {
    events,
    record: (event: AnyRunEvent<TEvents>) => {
      if (!shouldRecordEvent(event)) return;
      events.push(event);
      trackWrite(event);
    },
    flush: async () => {
      let observedQueue: Promise<void>;
      do {
        observedQueue = writeQueue;
        await observedQueue;
      } while (observedQueue !== writeQueue);
    },
  };
}
