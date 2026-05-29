import { describe, expect, it } from "vitest";
import {
  AgentRun,
  createSubAgentEventSink,
  type RunRecorder,
} from "@excelsior/agent-host/testing/runtime";
import {
  createFakeSessionManager,
  createPendingRunHandle,
  createFakeTurnLifecycle,
} from "./helpers/agentApplication.js";

describe("test helper fixtures", () => {
  it("creates a fake session manager with workspace and CRUD behavior", async () => {
    const manager = createFakeSessionManager();

    const session = manager.createSession("Fixture");

    expect(manager.getWorkspace()).toEqual({
      id: "ws_test",
      name: "Test workspace",
      rootPath: "/tmp/workspace",
    });
    expect(manager.getCurrentSessionId()).toBe(session.id);

    await manager.deleteSession(session.id);

    expect(manager.getCurrentSessionId()).toBeNull();
    expect(manager.listSessions()).toEqual([]);
  });

  it("creates fake turn lifecycle agent streams with pending completion", async () => {
    const lifecycle = createFakeTurnLifecycle();
    const run = new AgentRun("ses_test");
    const agent = lifecycle.createAgent({
      ctx: { capabilities: new Set() },
      run,
      childRuns: new Map(),
      recorder: createRecorder(),
      subAgentEvents: createSubAgentEventSink(),
    });
    const stream = agent.stream({
      messages: [{ role: "user", content: "hello" }],
      signal: new AbortController().signal,
      emit: () => {},
    });

    expect(lifecycle.streams[0].run.sessionId).toBe("ses_test");
    expect(lifecycle.streams[0].messages).toEqual([
      { role: "user", content: "hello" },
    ]);

    lifecycle.streams[0].resolve();
    await stream;
  });

  it("creates cancellable pending run handles", () => {
    const handle = createPendingRunHandle();

    handle.cancel();

    expect(typeof handle.completion.then).toBe("function");
  });
});

function createRecorder(): RunRecorder {
  return {
    recordEvent: async () => {},
    recordTurnComplete: async () => {},
    loadCompletedEvents: async () => [],
    loadRawEvents: async () => [],
    getLastCompletedTurn: async () => null,
    dropLastCompletedTurn: async () => ({
      dropped: false,
      removedEvents: 0,
      reason: "no-completed-turn",
    }),
    deleteSessionEvents: async () => {},
    deleteAllSessionEvents: async () => {},
  };
}
