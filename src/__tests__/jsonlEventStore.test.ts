import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  appendEvent,
  loadRawSessionEvents,
  loadSessionEvents,
  loadUntilLastCheckpoint,
  deleteSessionEvents,
  deleteAllSessionsEvents,
  resetSessionsDirForTests,
  setSessionsDirForTests,
} from "../lib/persistence/jsonlEventStore.js";
import { makeEvent, AnyAgentEvent } from "../lib/runtime/events.js";
import { TURN_COMPLETE } from "../lib/runtime/eventNames.js";

function sid(label: string): string {
  return `ses_test_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

async function cleanup(id: string): Promise<void> {
  await deleteSessionEvents(id);
}

describe("jsonlEventStore", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "excelsior-jsonl-"));
    setSessionsDirForTests(tempDir);
  });

  afterEach(async () => {
    resetSessionsDirForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("appends and reads events", async () => {
    const id = sid("append");
    const e1 = makeEvent("run_1", "user-input", { content: "hello" }, 0);
    const e2 = makeEvent("run_1", "text-delta", { delta: "Hi" }, 1);

    await appendEvent(id, e1 as AnyAgentEvent);
    await appendEvent(id, e2 as AnyAgentEvent);

    const loaded = await loadSessionEvents(id);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].type).toBe("user-input");
    expect((loaded[0] as any).data.content).toBe("hello");
    expect(loaded[1].type).toBe("text-delta");

    await cleanup(id);
  });

  it("returns empty array for missing session", async () => {
    const loaded = await loadSessionEvents("ses_nonexistent");
    expect(loaded).toEqual([]);
  });

  it("loadUntilLastCheckpoint returns all events with no checkpoint", async () => {
    const id = sid("no_checkpoint");
    const e1 = makeEvent("run_1", "user-input", { content: "hello" }, 0);
    await appendEvent(id, e1 as AnyAgentEvent);

    const result = await loadUntilLastCheckpoint(id);
    expect(result.events).toHaveLength(1);
    expect(result.lastCheckpointIndex).toBe(-1);
    expect(result.hasIncompleteRun).toBe(false);

    await cleanup(id);
  });

  it("loadUntilLastCheckpoint stops at last TURN_COMPLETE", async () => {
    const id = sid("checkpoint");
    await appendEvent(id, makeEvent("run_1", "user-input", { content: "hi" }, 0) as AnyAgentEvent);
    await appendEvent(id, makeEvent("run_1", "text-delta", { delta: "Hello" }, 1) as AnyAgentEvent);
    await appendEvent(id, makeEvent("run_1", TURN_COMPLETE, { runId: "run_1" }, 2) as AnyAgentEvent);
    await appendEvent(id, makeEvent("run_2", "user-input", { content: "post-crash" }, 0) as AnyAgentEvent);

    const result = await loadUntilLastCheckpoint(id);
    expect(result.events).toHaveLength(3);
    expect(result.lastCheckpointIndex).toBe(2);
    expect(result.hasIncompleteRun).toBe(true);
    expect(result.events[2].type).toBe(TURN_COMPLETE);

    await cleanup(id);
  });

  it("loadUntilLastCheckpoint detects incomplete run after checkpoint", async () => {
    const id = sid("incomplete");
    await appendEvent(id, makeEvent("run_1", "user-input", { content: "hi" }, 0) as AnyAgentEvent);
    await appendEvent(id, makeEvent("run_1", TURN_COMPLETE, { runId: "run_1" }, 1) as AnyAgentEvent);
    await appendEvent(id, makeEvent("run_2", "user-input", { content: "crash" }, 0) as AnyAgentEvent);
    await appendEvent(id, makeEvent("run_2", "text-delta", { delta: "..." }, 1) as AnyAgentEvent);

    const result = await loadUntilLastCheckpoint(id);
    expect(result.hasIncompleteRun).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events[1].type).toBe(TURN_COMPLETE);

    await cleanup(id);
  });

  it("loadSessionEvents excludes incomplete events while raw loading includes them", async () => {
    const id = sid("safe_restore");
    await appendEvent(id, makeEvent("run_1", "user-input", { content: "hi" }, 0) as AnyAgentEvent);
    await appendEvent(id, makeEvent("run_1", TURN_COMPLETE, { runId: "run_1" }, 1) as AnyAgentEvent);
    await appendEvent(id, makeEvent("run_2", "user-input", { content: "post-crash" }, 0) as AnyAgentEvent);

    const completed = await loadSessionEvents(id);
    const raw = await loadRawSessionEvents(id);

    expect(completed).toHaveLength(2);
    expect(raw).toHaveLength(3);

    await cleanup(id);
  });

  it("deletes session events file", async () => {
    const id = sid("delete_file");
    await appendEvent(id, makeEvent("run_1", "user-input", { content: "x" }, 0) as AnyAgentEvent);

    let loaded = await loadSessionEvents(id);
    expect(loaded).toHaveLength(1);

    await deleteSessionEvents(id);
    loaded = await loadSessionEvents(id);
    expect(loaded).toEqual([]);
  });

  it("deleteAllSessionsEvents removes all jsonl files", async () => {
    const id1 = sid("all_1");
    const id2 = sid("all_2");
    await appendEvent(id1, makeEvent("run_1", "user-input", { content: "a" }, 0) as AnyAgentEvent);
    await appendEvent(id2, makeEvent("run_1", "user-input", { content: "b" }, 0) as AnyAgentEvent);

    expect((await loadSessionEvents(id1)).length).toBe(1);
    expect((await loadSessionEvents(id2)).length).toBe(1);

    await deleteAllSessionsEvents();

    expect((await loadSessionEvents(id1)).length).toBe(0);
    expect((await loadSessionEvents(id2)).length).toBe(0);
  });

  it("handles concurrent events correctly", async () => {
    const id = sid("concurrent");
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent("run_1", "text-delta", { delta: String(i) }, i) as AnyAgentEvent,
    );
    for (const e of events) {
      await appendEvent(id, e);
    }

    const loaded = await loadSessionEvents(id);
    expect(loaded).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect((loaded[i] as any).data.delta).toBe(String(i));
    }

    await cleanup(id);
  });
});
