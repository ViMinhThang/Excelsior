import { describe, expect, it, vi } from "vitest";
import type { RunCompletion, RunHandle } from "@excelsior/run-runtime";
import {
  AgentStateStore,
  type CreateRunSession,
  ProjectionService,
  TurnLifecycle,
} from "@excelsior/agent-host/testing/application";
import {
  AgentRun,
  type AgentEventDataMap,
  type RunRecorder,
} from "@excelsior/agent-host/testing/runtime";
import { FileCheckpoint } from "@excelsior/agent-host/testing/tools";

function createDeferredRunHandle(cancel = vi.fn()): {
  handle: RunHandle<AgentEventDataMap>;
  resolveCompletion(completion: RunCompletion<AgentEventDataMap>): void;
} {
  let resolveCompletion!: (completion: RunCompletion<AgentEventDataMap>) => void;
  const completion = new Promise<RunCompletion<AgentEventDataMap>>((resolve) => {
    resolveCompletion = resolve;
  });
  return {
    handle: {
      completion,
      cancel,
    },
    resolveCompletion,
  };
}

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

function createState() {
  return new AgentStateStore(
    {
      workspace: {
        id: "ws_test",
        name: "Test workspace",
        rootPath: "/tmp/workspace",
      },
    },
    new ProjectionService(),
  );
}

function createLifecycle(input: {
  state: AgentStateStore;
  createRunSession: CreateRunSession;
}) {
  return new TurnLifecycle({
    state: input.state,
    projection: new ProjectionService(),
    recorder: createRecorder(),
    subAgentEvents: { emit: () => {}, on: () => () => {} },
    fileCheckpoint: new FileCheckpoint(),
    appendFinalEvents: vi.fn(),
    dependencies: { createRunSession: input.createRunSession },
  });
}

describe("TurnLifecycle", () => {
  it("starts a turn and updates live events", () => {
    let run!: AgentRun;
    const state = createState();
    const lifecycle = createLifecycle({
      state,
      createRunSession: (config) => {
        run = new AgentRun(config.sessionId);
        return {
          run,
          childRuns: new Map(),
          handle: createDeferredRunHandle().handle,
          sessionId: config.sessionId ?? run.id,
        };
      },
    });

    lifecycle.startUserTurn({
      content: "hello",
      mode: "act",
      sessionId: "ses_1",
      workspaceRoot: "/tmp/workspace",
    });
    run.emit("text-delta", { delta: "hello" });
    run.flushNotify();

    expect(state.isLoading).toBe(true);
    expect(state.activeRun).toBe(run);
    expect(state.liveEvents).toEqual([
      expect.objectContaining({ type: "user-input" }),
      expect.objectContaining({ type: "text-delta" }),
    ]);
  });

  it("appends final events and clears loading on completion", async () => {
    let run!: AgentRun;
    let resolveCompletion!: (completion: RunCompletion<AgentEventDataMap>) => void;
    const state = createState();
    const appendFinalEvents = vi.fn();
    const deferred = createDeferredRunHandle();
    resolveCompletion = deferred.resolveCompletion;
    const lifecycle = new TurnLifecycle({
      state,
      projection: new ProjectionService(),
      recorder: createRecorder(),
      subAgentEvents: { emit: () => {}, on: () => () => {} },
      fileCheckpoint: new FileCheckpoint(),
      appendFinalEvents,
      dependencies: {
        createRunSession: (config) => {
          run = new AgentRun(config.sessionId);
          return {
            run,
            childRuns: new Map(),
            handle: deferred.handle,
            sessionId: config.sessionId ?? run.id,
          };
        },
      },
    });

    lifecycle.startUserTurn({
      content: "hello",
      mode: "act",
      sessionId: "ses_1",
      workspaceRoot: "/tmp/workspace",
    });
    resolveCompletion({ status: "completed", events: [...run.getSnapshot()] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appendFinalEvents).toHaveBeenCalledWith([
      expect.objectContaining({ type: "user-input" }),
    ]);
    expect(state.isLoading).toBe(false);
    expect(state.activeRun).toBeNull();
  });

  it("ignores stale completions after cancel", async () => {
    let run!: AgentRun;
    let resolveCompletion!: (completion: RunCompletion<AgentEventDataMap>) => void;
    const state = createState();
    const appendFinalEvents = vi.fn();
    const deferred = createDeferredRunHandle();
    resolveCompletion = deferred.resolveCompletion;
    const lifecycle = new TurnLifecycle({
      state,
      projection: new ProjectionService(),
      recorder: createRecorder(),
      subAgentEvents: { emit: () => {}, on: () => () => {} },
      fileCheckpoint: new FileCheckpoint(),
      appendFinalEvents,
      dependencies: {
        createRunSession: (config) => {
          run = new AgentRun(config.sessionId);
          return {
            run,
            childRuns: new Map(),
            handle: deferred.handle,
            sessionId: config.sessionId ?? run.id,
          };
        },
      },
    });

    lifecycle.startUserTurn({
      content: "hello",
      mode: "act",
      sessionId: "ses_1",
      workspaceRoot: "/tmp/workspace",
    });
    lifecycle.cancel();
    resolveCompletion({ status: "completed", events: [...run.getSnapshot()] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appendFinalEvents).not.toHaveBeenCalled();
  });
});
