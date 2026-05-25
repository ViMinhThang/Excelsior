import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AgentRun } from "@excelsior/agent-host/testing/runtime";

describe("AgentRun", () => {
  let run: AgentRun;

  beforeEach(() => {
    run = new AgentRun();
  });

  afterEach(() => {
    run.cancel();
  });

  it("creates a run with an id", () => {
    expect(run.id).toBeTruthy();
    expect(run.id).toMatch(/^run_/);
  });

  it("starts with empty snapshot", () => {
    expect(run.getSnapshot()).toEqual([]);
  });

  it("records events via emit", () => {
    run.emit("user-input", { content: "hello" });
    const snapshot = run.getSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ type: "user-input", data: { content: "hello" } });
  });

  it("increments sequence numbers", () => {
    run.emit("user-input", { content: "a" });
    run.emit("user-input", { content: "b" });
    const events = run.getSnapshot();
    expect(events[0].sequence).toBe(0);
    expect(events[1].sequence).toBe(1);
  });

  it("freezes events", () => {
    run.emit("user-input", { content: "hi" });
    const evt = run.getSnapshot()[0];
    expect(Object.isFrozen(evt)).toBe(true);
  });

  it("does not emit after cancel (except run-end)", () => {
    run.emit("run-start", {});
    run.cancel();
    run.emit("user-input", { content: "should-not-appear" });
    const events = run.getSnapshot();
    expect(events.every((e) => e.type !== "user-input")).toBe(true);
  });

  it("notifies subscribers on emit", async () => {
    const listener = vi.fn();
    run.subscribe(listener);
    run.emit("user-input", { content: "test" });
    await new Promise((r) => setTimeout(r, 10));
    expect(listener).toHaveBeenCalled();
  });

  it("unsubscribes listeners", () => {
    const listener = vi.fn();
    const unsub = run.subscribe(listener);
    unsub();
    run.emit("user-input", { content: "test" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("flushNotify immediately triggers listeners", () => {
    const listener = vi.fn();
    run.subscribe(listener);
    run.emit("user-input", { content: "x" });
    run.flushNotify();
    expect(listener).toHaveBeenCalled();
  });

  it("abortSignal is aborted on cancel", () => {
    const signal = run.abortSignal;
    expect(signal.aborted).toBe(false);
    run.cancel();
    expect(signal.aborted).toBe(true);
  });

  it("parent abort signal cancels the run signal", () => {
    const parent = new AbortController();
    const child = new AgentRun("ses_test", undefined, undefined, parent.signal);
    const signal = child.abortSignal;

    parent.abort("stopped");

    expect(child.isCancelled).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("stopped");
  });

  it("isCancelled returns true after cancel", () => {
    expect(run.isCancelled).toBe(false);
    run.cancel();
    expect(run.isCancelled).toBe(true);
  });

  it("correlationId defaults to run id", () => {
    expect(run.correlationId).toBe(run.id);
  });

  it("accepts sessionId, parentEventId and correlationId", () => {
    const child = new AgentRun("ses_test", "parent123", "corr456");
    expect(child.sessionId).toBe("ses_test");
    expect(child.parentEventId).toBe("parent123");
    expect(child.correlationId).toBe("corr456");
  });

  it("passes causationId from last event to next", () => {
    run.emit("user-input", { content: "a" });
    const firstId = run.getSnapshot()[0].id;
    run.emit("user-input", { content: "b" });
    const second = run.getSnapshot()[1];
    expect(second.causationId).toBe(firstId);
  });
});
