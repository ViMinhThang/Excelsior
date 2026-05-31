import { describe, expect, it, vi } from "vitest";
import { createRunPersistenceTracker, type RunEvent } from "@excelsior/run-runtime";

type TestEvents = {
  skip: Record<string, never>;
  message: { text: string };
};

function messageEvent(sequence: number, text: string): RunEvent<"message", { text: string }> {
  return {
    id: `evt_${sequence}`,
    runId: "run_1",
    sequence,
    type: "message",
    version: 1,
    causationId: "",
    correlationId: "run_1",
    timestamp: `2026-01-01T00:00:0${sequence}.000Z`,
    data: { text },
  };
}

function skipEvent(sequence: number): RunEvent<"skip", Record<string, never>> {
  return {
    id: `evt_${sequence}`,
    runId: "run_1",
    sequence,
    type: "skip",
    version: 1,
    causationId: "",
    correlationId: "run_1",
    timestamp: `2026-01-01T00:00:0${sequence}.000Z`,
    data: {},
  };
}

describe("run persistence tracker", () => {
  it("filters initial and recorded events through one policy", () => {
    const tracker = createRunPersistenceTracker<TestEvents>({
      initialEvents: [
        skipEvent(0),
        messageEvent(1, "initial"),
      ],
      persist: {
        filter: (entry) => entry.type !== "skip",
      },
    });

    tracker.record(skipEvent(2));
    tracker.record(messageEvent(3, "recorded"));

    expect(tracker.events.map((entry) => entry.type)).toEqual(["message", "message"]);
  });

  it("serializes writes and reports persistence errors once", async () => {
    const onError = vi.fn();
    const attempts: string[] = [];
    const tracker = createRunPersistenceTracker<TestEvents>({
      initialEvents: [],
      persist: {
        write: async (entry) => {
          if (entry.type === "message") attempts.push(entry.data.text);
          throw new Error("disk full");
        },
        onError,
      },
    });

    tracker.record(messageEvent(0, "a"));
    tracker.record(messageEvent(1, "b"));
    await tracker.flush();

    expect(attempts).toEqual(["a", "b"]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
