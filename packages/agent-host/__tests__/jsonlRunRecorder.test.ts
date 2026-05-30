import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  JsonlRunRecorder,
} from "@excelsior/agent-host/testing/persistence";
import {
  makeEvent,
  TURN_COMPLETE,
  type AnyAgentEvent,
} from "@excelsior/agent-host/testing/runtime";

function sid(label: string): string {
  return `ses_test_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

describe("JsonlRunRecorder", () => {
  let tempDir: string;
  let recorder: JsonlRunRecorder;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "excelsior-jsonl-"));
    recorder = new JsonlRunRecorder(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function record(sessionId: string, event: AnyAgentEvent): Promise<void> {
    await recorder.recordEvent(sessionId, event);
  }

  it("records and reads events", async () => {
    const id = sid("append");
    const e1 = makeEvent("run_1", "user-input", { content: "hello" }, 0);
    const e2 = makeEvent("run_1", "text-delta", { delta: "Hi" }, 1);

    await record(id, e1 as AnyAgentEvent);
    await record(id, e2 as AnyAgentEvent);

    const loaded = await recorder.loadCompletedEvents(id);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].type).toBe("user-input");
    if (loaded[0].type !== "user-input") throw new Error("Expected user input");
    expect(loaded[0].data.content).toBe("hello");
    expect(loaded[1].type).toBe("text-delta");
  });

  it("returns empty arrays for missing sessions", async () => {
    await expect(recorder.loadCompletedEvents("ses_nonexistent")).resolves.toEqual(
      [],
    );
    await expect(recorder.loadRawEvents("ses_nonexistent")).resolves.toEqual([]);
  });

  it("loads uncheckpointed legacy events", async () => {
    const id = sid("no_checkpoint");
    const event = makeEvent("run_1", "user-input", { content: "hello" }, 0);
    await record(id, event as AnyAgentEvent);

    await expect(recorder.loadCompletedEvents(id)).resolves.toHaveLength(1);
  });

  it("loads only completed turns when later raw events are incomplete", async () => {
    const id = sid("checkpoint");
    await record(
      id,
      makeEvent("run_1", "user-input", { content: "hi" }, 0) as AnyAgentEvent,
    );
    await record(
      id,
      makeEvent("run_1", "text-delta", { delta: "Hello" }, 1) as AnyAgentEvent,
    );
    await recorder.recordTurnComplete(id, "run_1", 2);
    await record(
      id,
      makeEvent(
        "run_2",
        "user-input",
        { content: "post-crash" },
        0,
      ) as AnyAgentEvent,
    );

    const completed = await recorder.loadCompletedEvents(id);
    const raw = await recorder.loadRawEvents(id);

    expect(completed).toHaveLength(3);
    expect(completed[2].type).toBe(TURN_COMPLETE);
    expect(raw).toHaveLength(4);
  });

  it("reorders completed events by run sequence even when file lines are scrambled", async () => {
    const id = sid("scrambled");
    await record(
      id,
      makeEvent("run_1", "user-input", { content: "hi" }, 1) as AnyAgentEvent,
    );
    await recorder.recordTurnComplete(id, "run_1", 4);
    await record(
      id,
      makeEvent(
        "run_1",
        "text-delta",
        { delta: "Hello " },
        2,
      ) as AnyAgentEvent,
    );
    await record(
      id,
      makeEvent("run_1", "text-delta", { delta: "world" }, 3) as AnyAgentEvent,
    );

    const completed = await recorder.loadCompletedEvents(id);

    expect(completed.map((event) => event.type)).toEqual([
      "user-input",
      "text-delta",
      "text-delta",
      TURN_COMPLETE,
    ]);
    expect(
      completed
        .filter((event): event is Extract<AnyAgentEvent, { type: "text-delta" }> => event.type === "text-delta")
        .map((event) => event.data.delta)
        .join(""),
    ).toBe("Hello world");
  });

  it("excludes incomplete run events after a completed turn", async () => {
    const id = sid("incomplete");
    await record(
      id,
      makeEvent("run_1", "user-input", { content: "hi" }, 0) as AnyAgentEvent,
    );
    await recorder.recordTurnComplete(id, "run_1", 1);
    await record(
      id,
      makeEvent("run_2", "user-input", { content: "crash" }, 0) as AnyAgentEvent,
    );
    await record(
      id,
      makeEvent("run_2", "text-delta", { delta: "..." }, 1) as AnyAgentEvent,
    );

    const completed = await recorder.loadCompletedEvents(id);
    const raw = await recorder.loadRawEvents(id);

    expect(completed).toHaveLength(2);
    expect(completed[1].type).toBe(TURN_COMPLETE);
    expect(raw).toHaveLength(4);
  });

  it("drops the latest completed turn and its child events", async () => {
    const id = sid("drop_latest");
    await record(
      id,
      makeEvent("run_1", "user-input", { content: "first" }, 0) as AnyAgentEvent,
    );
    await recorder.recordTurnComplete(id, "run_1", 1);
    await record(
      id,
      makeEvent("run_2", "user-input", { content: "second" }, 0) as AnyAgentEvent,
    );
    await record(
      id,
      makeEvent("child_2", "text-delta", { delta: "child" }, 0, {
        parentEventId: "run_2",
        correlationId: "run_2",
      }) as AnyAgentEvent,
    );
    await recorder.recordTurnComplete(id, "run_2", 1);

    await expect(recorder.getLastCompletedTurn(id)).resolves.toMatchObject({
      runId: "run_2",
      eventCount: 3,
    });

    const result = await recorder.dropLastCompletedTurn(id, "run_2");

    expect(result).toEqual({
      dropped: true,
      runId: "run_2",
      removedEvents: 3,
    });
    expect((await recorder.loadRawEvents(id)).map((event) => event.runId)).toEqual(
      ["run_1", "run_1"],
    );
    await expect(recorder.getLastCompletedTurn(id)).resolves.toMatchObject({
      runId: "run_1",
    });
  });

  it("does not drop history when the expected latest run id mismatches", async () => {
    const id = sid("drop_mismatch");
    await record(
      id,
      makeEvent("run_1", "user-input", { content: "first" }, 0) as AnyAgentEvent,
    );
    await recorder.recordTurnComplete(id, "run_1", 1);

    const result = await recorder.dropLastCompletedTurn(id, "different_run");

    expect(result).toEqual({
      dropped: false,
      runId: "run_1",
      removedEvents: 0,
      reason: "latest-turn-mismatch",
    });
    await expect(recorder.loadRawEvents(id)).resolves.toHaveLength(2);
  });

  it("treats sessions without completed turns as no-ops", async () => {
    const id = sid("drop_empty");

    await expect(recorder.dropLastCompletedTurn(id)).resolves.toEqual({
      dropped: false,
      removedEvents: 0,
      reason: "no-completed-turn",
    });
  });

  it("deletes a session event file", async () => {
    const id = sid("delete_file");
    await record(
      id,
      makeEvent("run_1", "user-input", { content: "x" }, 0) as AnyAgentEvent,
    );

    let loaded = await recorder.loadCompletedEvents(id);
    expect(loaded).toHaveLength(1);

    await recorder.deleteSessionEvents(id);
    loaded = await recorder.loadCompletedEvents(id);
    expect(loaded).toEqual([]);
  });

  it("deletes all session event files", async () => {
    const id1 = sid("all_1");
    const id2 = sid("all_2");
    await record(
      id1,
      makeEvent("run_1", "user-input", { content: "a" }, 0) as AnyAgentEvent,
    );
    await record(
      id2,
      makeEvent("run_1", "user-input", { content: "b" }, 0) as AnyAgentEvent,
    );

    expect(await recorder.loadCompletedEvents(id1)).toHaveLength(1);
    expect(await recorder.loadCompletedEvents(id2)).toHaveLength(1);

    await recorder.deleteAllSessionEvents();

    expect(await recorder.loadCompletedEvents(id1)).toHaveLength(0);
    expect(await recorder.loadCompletedEvents(id2)).toHaveLength(0);
  });

  it("serializes concurrent appends for one session file", async () => {
    const id = sid("concurrent");
    const events = Array.from(
      { length: 10 },
      (_, i) =>
        makeEvent("run_1", "text-delta", {
          delta: String(i),
        }, i) as AnyAgentEvent,
    );
    await Promise.all(events.map((event) => recorder.recordEvent(id, event)));

    const loaded = await recorder.loadRawEvents(id);
    expect(loaded).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      const event = loaded[i];
      if (!event || event.type !== "text-delta") throw new Error("Expected text delta");
      expect(event.data.delta).toBe(String(i));
    }
  });
});
