import { describe, expect, it, vi } from "vitest";
import {
  AgentStateStore,
  ProjectionService,
  SessionController,
} from "@excelsior/agent-host/testing/application";
import {
  makeEvent,
  type AnyAgentEvent,
  type RunRecorder,
} from "@excelsior/agent-host/testing/runtime";
import { createFakeSessionManager } from "./helpers/agentApplication.js";

function createController(events: AnyAgentEvent[] = []) {
  const state = new AgentStateStore(
    {
      workspace: {
        id: "ws_test",
        name: "Test workspace",
        rootPath: "/tmp/workspace",
      },
    },
    new ProjectionService(),
  );
  const cancelActiveTurn = vi.fn();
  const recorder: RunRecorder = {
    recordEvent: vi.fn(async () => {}),
    recordTurnComplete: vi.fn(async () => {}),
    loadCompletedEvents: vi.fn(async () => events),
    loadRawEvents: vi.fn(async () => []),
    getLastCompletedTurn: vi.fn(async () => null),
    dropLastCompletedTurn: vi.fn(async () => ({
      dropped: false,
      removedEvents: 0,
      reason: "no-completed-turn",
    })),
    deleteSessionEvents: vi.fn(async () => {}),
    deleteAllSessionEvents: vi.fn(async () => {}),
  };
  const controller = new SessionController(
    createFakeSessionManager(),
    recorder,
    state,
    cancelActiveTurn,
  );
  return { controller, state, cancelActiveTurn, recorder };
}

describe("SessionController", () => {
  it("updates state for create, rename, and delete", async () => {
    const { controller, state } = createController();

    const session = controller.createSession("First");
    controller.renameSession(session.id, "Renamed");
    await controller.deleteSession(session.id);

    expect(state.sessions).toEqual([]);
    expect(state.currentSessionId).toBeNull();
    expect(state.persistedEvents).toEqual([]);
  });

  it("cancels active work and reloads persisted events when switching sessions", async () => {
    const event = makeEvent("run_1", "user-input", { content: "hi" }, 0) as AnyAgentEvent;
    const { controller, state, cancelActiveTurn, recorder } = createController([event]);
    const session = controller.createSession("First");

    await controller.switchSession(session.id);

    expect(cancelActiveTurn).toHaveBeenCalled();
    expect(recorder.loadCompletedEvents).toHaveBeenCalledWith(session.id);
    expect(state.persistedEvents).toEqual([event]);
  });
});
