import { describe, expect, it, vi } from "vitest";
import type { RunCompletion, RunHandle } from "@excelsior/run-runtime";
import {
  AgentStateStore,
  ProjectionService,
  TurnController,
  type ChatTurnService,
} from "@excelsior/agent-host/testing/application";
import {
  AgentRun,
  type AgentEventDataMap,
  type AnyAgentEvent,
} from "@excelsior/agent-host/testing/runtime";

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
      done: completion.then((result) => result.events),
      cancel,
    },
    resolveCompletion,
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

describe("TurnController", () => {
  it("starts a turn and updates live events", () => {
    let run!: AgentRun;
    const state = createState();
    const appendFinalEvents = vi.fn();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        run = new AgentRun(options.sessionId);
        return {
          run,
          childRuns: new Map(),
          handle: createDeferredRunHandle().handle,
          sessionId: options.sessionId,
        };
      }),
    };
    const controller = new TurnController(chatService, state, appendFinalEvents);

    controller.startTurn("hello", {
      history: [],
      mode: "act",
      sessionId: "ses_1",
      workspaceId: "ws_test",
      workspaceRoot: "/tmp/workspace",
      subAgentEvents: { emit: () => {}, on: () => () => {} },
    });
    run.emit("user-input", { content: "hello" });
    run.flushNotify();

    expect(state.isLoading).toBe(true);
    expect(state.activeRun).toBe(run);
    expect(state.liveEvents).toHaveLength(1);
  });

  it("appends final events and clears loading on completion", async () => {
    let run!: AgentRun;
    let resolveCompletion!: (completion: RunCompletion<AgentEventDataMap>) => void;
    const state = createState();
    const appendFinalEvents = vi.fn();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        run = new AgentRun(options.sessionId);
        const deferred = createDeferredRunHandle();
        resolveCompletion = deferred.resolveCompletion;
        return {
          run,
          childRuns: new Map(),
          handle: deferred.handle,
          sessionId: options.sessionId,
        };
      }),
    };
    const controller = new TurnController(chatService, state, appendFinalEvents);

    controller.startTurn("hello", {
      history: [],
      mode: "act",
      sessionId: "ses_1",
      workspaceId: "ws_test",
      workspaceRoot: "/tmp/workspace",
      subAgentEvents: { emit: () => {}, on: () => () => {} },
    });
    run.emit("user-input", { content: "hello" });
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
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        run = new AgentRun(options.sessionId);
        const deferred = createDeferredRunHandle();
        resolveCompletion = deferred.resolveCompletion;
        return {
          run,
          childRuns: new Map(),
          handle: deferred.handle,
          sessionId: options.sessionId,
        };
      }),
    };
    const controller = new TurnController(chatService, state, appendFinalEvents);

    controller.startTurn("hello", {
      history: [],
      mode: "act",
      sessionId: "ses_1",
      workspaceId: "ws_test",
      workspaceRoot: "/tmp/workspace",
      subAgentEvents: { emit: () => {}, on: () => () => {} },
    });
    controller.cancel();
    resolveCompletion({ status: "completed", events: [...run.getSnapshot()] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appendFinalEvents).not.toHaveBeenCalled();
  });
});
