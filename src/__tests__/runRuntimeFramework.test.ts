import { describe, expect, it, vi } from "vitest";
import { EventfulRun, RunOrchestrator } from "@excelsior/run-runtime";

type TestEvents = {
  "run-start": Record<string, never>;
  "run-end": { cancelled: boolean };
  message: { text: string };
  error: { message: string };
};

describe("@excelsior/run-runtime EventfulRun", () => {
  it("creates run ids with the configured prefix", () => {
    const run = new EventfulRun<TestEvents>({ idPrefix: "job" });

    expect(run.id).toMatch(/^job_/);
    run.cancel();
  });

  it("emits frozen event envelopes with stable schema", () => {
    const run = new EventfulRun<TestEvents>({
      idPrefix: "job",
      eventVersion: 7,
      createEventId: () => "evt_test",
    });

    run.emit("message", { text: "hello" });

    const event = run.getSnapshot()[0];
    expect(Object.isFrozen(event)).toBe(true);
    expect(event).toMatchObject({
      id: "evt_test",
      runId: run.id,
      sequence: 0,
      type: "message",
      version: 7,
      causationId: "",
      correlationId: run.id,
      data: { text: "hello" },
    });
    run.cancel();
  });

  it("uses injected run ids, event ids, and timestamps for deterministic tests", () => {
    const run = new EventfulRun<TestEvents>({
      createRunId: () => "run_test",
      createEventId: () => "evt_test",
      now: () => "2026-01-02T03:04:05.000Z",
    });

    run.emit("message", { text: "hello" });

    expect(run.id).toBe("run_test");
    expect(run.sessionId).toBe("run_test");
    expect(run.getSnapshot()[0]).toMatchObject({
      id: "evt_test",
      runId: "run_test",
      correlationId: "run_test",
      timestamp: "2026-01-02T03:04:05.000Z",
    });
    run.cancel();
  });

  it("increments sequence numbers and causation ids", () => {
    let id = 0;
    const run = new EventfulRun<TestEvents>({
      createEventId: () => `evt_${++id}`,
    });

    run.emit("message", { text: "a" });
    run.emit("message", { text: "b" });

    const events = run.getSnapshot();
    expect(events[0].sequence).toBe(0);
    expect(events[1].sequence).toBe(1);
    expect(events[1].causationId).toBe(events[0].id);
    run.cancel();
  });

  it("preserves correlation id and parent event id", () => {
    const run = new EventfulRun<TestEvents>({
      parentEventId: "parent_evt",
      correlationId: "corr_1",
    });

    run.emit("message", { text: "child" });

    expect(run.getSnapshot()[0]).toMatchObject({
      parentEventId: "parent_evt",
      correlationId: "corr_1",
    });
    run.cancel();
  });

  it("blocks normal emits after cancellation but allows configured terminal events", () => {
    const run = new EventfulRun<TestEvents>({
      terminalEventTypes: ["run-end"],
    });

    run.cancel();
    run.emit("message", { text: "nope" });
    run.emit("run-end", { cancelled: true });

    expect(run.getSnapshot().map((event) => event.type)).toEqual(["run-end"]);
  });

  it("propagates parent abort signal", () => {
    const parent = new AbortController();
    const run = new EventfulRun<TestEvents>({ parentSignal: parent.signal });
    const signal = run.abortSignal;

    parent.abort("stop");

    expect(run.isCancelled).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("stop");
  });

  it("notifies subscribers and supports unsubscribe and flush", async () => {
    const run = new EventfulRun<TestEvents>();
    const listener = vi.fn();
    const unsub = run.subscribe(listener);

    run.emit("message", { text: "a" });
    run.flushNotify();
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    run.emit("message", { text: "b" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listener).toHaveBeenCalledTimes(1);
    run.cancel();
  });

  it("batches subscriber notifications across multiple emits", async () => {
    const run = new EventfulRun<TestEvents>();
    const listener = vi.fn();
    run.subscribe(listener);

    run.emit("message", { text: "a" });
    run.emit("message", { text: "b" });
    run.emit("message", { text: "c" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(run.getSnapshot()).toHaveLength(3);
    expect(listener).toHaveBeenCalledTimes(1);
    run.cancel();
  });
});

describe("@excelsior/run-runtime RunOrchestrator", () => {
  it("calls execute with run, signal, and emit, then resolves completion with emitted events", async () => {
    const run = new EventfulRun<TestEvents>();
    const orchestrator = new RunOrchestrator<TestEvents>();

    const handle = orchestrator.start(run, {
      execute: async ({ run: activeRun, signal, emit }) => {
        expect(activeRun).toBe(run);
        expect(signal).toBe(run.abortSignal);
        emit("message", { text: "hello" });
      },
    });

    const completion = await handle.completion;
    expect(completion.events).toMatchObject([
      { type: "message", data: { text: "hello" } },
    ]);
    expect(completion).toMatchObject({
      status: "completed",
      events: [{ type: "message", data: { text: "hello" } }],
    });
    run.cancel();
  });

  it("cancel aborts the run, reports cancelled completion, and removes the event listener", async () => {
    const run = new EventfulRun<TestEvents>();
    const orchestrator = new RunOrchestrator<TestEvents>();

    const handle = orchestrator.start(run, {
      execute: async ({ signal }) => {
        if (signal.aborted) return;
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    });

    handle.cancel("stop");
    await expect(handle.completion).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "stop",
    });

    expect(run.isCancelled).toBe(true);
    expect(run.bus.getListenerCount("event")).toBe(0);
  });

  it("reports parent aborts as cancelled completion", async () => {
    const parent = new AbortController();
    const run = new EventfulRun<TestEvents>({ parentSignal: parent.signal });
    const orchestrator = new RunOrchestrator<TestEvents>();

    const handle = orchestrator.start(run, {
      execute: async ({ signal }) => {
        if (signal.aborted) return;
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    });

    parent.abort("parent stop");

    await expect(handle.completion).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "parent stop",
      events: [],
    });
    expect(run.bus.getListenerCount("event")).toBe(0);
  });

  it("reports abort errors as cancelled completion", async () => {
    const run = new EventfulRun<TestEvents>();
    const orchestrator = new RunOrchestrator<TestEvents>();
    const abortError = new Error("aborted by transport");
    abortError.name = "AbortError";

    const handle = orchestrator.start(run, {
      execute: async () => {
        throw abortError;
      },
    });

    await expect(handle.completion).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: abortError,
    });
    expect(run.bus.getListenerCount("event")).toBe(0);
  });

  it("records only events allowed by persist.filter", async () => {
    const run = new EventfulRun<TestEvents>();
    const orchestrator = new RunOrchestrator<TestEvents>();
    const recorded: string[] = [];

    const handle = orchestrator.start(run, {
      persist: {
        filter: (event) => event.type !== "run-start",
        write: async (event) => {
          recorded.push(event.type);
        },
      },
      execute: async ({ emit }) => {
        emit("run-start", {});
        emit("message", { text: "hi" });
      },
    });

    const result = await handle.completion;

    expect(recorded).toEqual(["message"]);
    expect(result.events.map((event) => event.type)).toEqual(["message"]);
    run.cancel();
  });

  it("fires persist.onError once for repeated recorder failures", async () => {
    const run = new EventfulRun<TestEvents>();
    const orchestrator = new RunOrchestrator<TestEvents>();
    const onPersistError = vi.fn();
    const attempts: string[] = [];

    const handle = orchestrator.start(run, {
      persist: {
        write: async (event) => {
          if (event.type === "message") attempts.push(event.data.text);
          throw new Error("disk full");
        },
        onError: onPersistError,
      },
      execute: async ({ emit }) => {
        emit("message", { text: "a" });
        emit("message", { text: "b" });
      },
    });

    await handle.completion;

    expect(attempts).toEqual(["a", "b"]);
    expect(onPersistError).toHaveBeenCalledTimes(1);
    expect(onPersistError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "disk full" }),
      expect.objectContaining({ type: "message", data: { text: "a" } }),
    );
    run.cancel();
  });

  it("waits for pending persistence writes and listener cleanup before resolving completion", async () => {
    const run = new EventfulRun<TestEvents>();
    const orchestrator = new RunOrchestrator<TestEvents>();
    let releaseWrite: (() => void) | null = null;
    let completionResolved = false;

    const handle = orchestrator.start(run, {
      persist: {
        write: async () => {
          await new Promise<void>((resolve) => {
            releaseWrite = resolve;
          });
        },
      },
      execute: async ({ emit }) => {
        emit("message", { text: "wait" });
      },
    });

    handle.completion.then(() => {
      completionResolved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completionResolved).toBe(false);
    expect(run.bus.getListenerCount("event")).toBe(1);

    releaseWrite?.();
    await handle.completion;

    expect(completionResolved).toBe(true);
    expect(run.bus.getListenerCount("event")).toBe(0);
    run.cancel();
  });

  it("persists events FIFO without overlapping delayed writes", async () => {
    const run = new EventfulRun<TestEvents>();
    const orchestrator = new RunOrchestrator<TestEvents>();
    const order: string[] = [];

    const handle = orchestrator.start(run, {
      persist: {
        write: async (event) => {
          if (event.type !== "message") return;
          order.push(`start:${event.data.text}`);
          await Promise.resolve();
          order.push(`end:${event.data.text}`);
        },
      },
      execute: async ({ emit }) => {
        emit("message", { text: "a" });
        emit("message", { text: "b" });
        emit("message", { text: "c" });
      },
    });

    await handle.completion;

    expect(order).toEqual([
      "start:a",
      "end:a",
      "start:b",
      "end:b",
      "start:c",
      "end:c",
    ]);
    run.cancel();
  });

  it("handles non-abort execute errors without knowing app error events", async () => {
    const run = new EventfulRun<TestEvents>();
    const orchestrator = new RunOrchestrator<TestEvents>();
    const onError = vi.fn();
    const error = new Error("boom");

    const handle = orchestrator.start(run, {
      onError,
      execute: async ({ emit }) => {
        emit("message", { text: "before" });
        throw error;
      },
    });

    const completion = await handle.completion;
    expect(completion.events).toMatchObject([
      { type: "message", data: { text: "before" } },
    ]);
    expect(completion).toMatchObject({
      status: "failed",
      error,
      events: [{ type: "message", data: { text: "before" } }],
    });
    expect(onError).toHaveBeenCalledWith(error);
    run.cancel();
  });
});
