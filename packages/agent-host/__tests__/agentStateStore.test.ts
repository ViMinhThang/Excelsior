import { describe, expect, it, vi } from "vitest";
import { AgentRun } from "@excelsior/agent-host/testing/runtime";
import {
  AgentStateStore,
  ProjectionPolicy,
} from "@excelsior/agent-host/testing/application";

function createStore() {
  return new AgentStateStore(
    {
      workspace: {
        id: "ws_test",
        name: "Test workspace",
        rootPath: "/tmp/workspace",
      },
    },
    new ProjectionPolicy(),
  );
}

describe("AgentStateStore", () => {
  it("keeps snapshot identity stable until state changes", () => {
    const store = createStore();

    const first = store.getSnapshot();
    const second = store.getSnapshot();
    store.setMode("act");

    expect(second).toBe(first);
    expect(store.getSnapshot()).not.toBe(first);
    expect(store.getSnapshot().mode).toBe("act");
  });

  it("notifies subscribers once per state mutation", () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setMode("act");
    store.setPersistedEvents([]);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("projects live run events into snapshots", () => {
    const store = createStore();
    const run = new AgentRun("ses_1");

    run.emit("user-input", { content: "hello" });
    store.startRun(run, new Map());
    store.setLiveEvents(run.getSnapshot());

    expect(store.getSnapshot()).toMatchObject({
      isLoading: true,
      activeRun: run,
      displayBlocks: [expect.objectContaining({ type: "user", content: "hello" })],
    });
  });
});
