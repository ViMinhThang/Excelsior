import { describe, expect, it, vi } from "vitest";
import type { Session } from "@excelsior/core";
import {
  AgentStateStore,
  type AgentFactory,
  ProjectionPolicy,
  TurnLifecycle,
  type AgentSessionStorage,
} from "@excelsior/agent-host/testing/application";
import {
  AgentRun,
} from "@excelsior/agent-host/testing/runtime";
import { createFakeRunRecorder } from "./helpers/agentApplication.js";

interface ControlledAgentStream {
  run: AgentRun;
  resolve(): void;
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
    new ProjectionPolicy(),
  );
}

function createSessionStorage(): AgentSessionStorage {
  return {
    getCurrentSessionId: () => "ses_test",
    getWorkspaceId: () => "ws_test",
    getWorkspace: () => ({ id: "ws_test", name: "Test workspace", rootPath: "/tmp/workspace" }),
    ensureSession: () => "ses_test",
    createSession: () => testSession(),
    switchSession: () => {},
    deleteSession: async () => {},
    deleteAllSessions: async () => {},
    renameSession: () => {},
    listSessions: () => [],
    loadCurrentSessionEvents: async () => [],
    getLastCompletedTurn: async () => null,
    trimLastCompletedTurn: async () => ({ dropped: true, removedEvents: 0 }),
    recordTurnComplete: async () => {},
  };
}

function testSession(): Session {
  return {
    id: "ses_test",
    startedAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    metadata: { userInput: "test" },
    workspaceId: "ws_test",
    title: "Test session",
  };
}

function createControlledAgentFactory(): {
  agentFactory: AgentFactory;
  streams: ControlledAgentStream[];
} {
  const streams: ControlledAgentStream[] = [];
  const create = vi.fn((input) => {
    const runCtx = input.runContext;
    let resolve!: () => void;
    const completion = new Promise<void>((finish) => {
      resolve = finish;
    });
    streams.push({ run: runCtx.run, resolve });
    return {
      stream: async () => {
        await completion;
      },
    };
  });

  return { agentFactory: { create }, streams };
}

async function waitForStream(
  streams: ControlledAgentStream[],
): Promise<ControlledAgentStream> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const stream = streams[0];
    if (stream) return stream;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for fake agent stream");
}

function createLifecycle(input: {
  state: AgentStateStore;
  appendFinalEvents?: (events: readonly unknown[]) => void;
}) {
  const recorder = createFakeRunRecorder();
  const controls = createControlledAgentFactory();
  const lifecycle = new TurnLifecycle({
    state: input.state,
    projection: new ProjectionPolicy(),
    recorder,
    subAgentEvents: { emit: () => {}, on: () => () => {} },
    sessionStorage: createSessionStorage(),
    appendFinalEvents: input.appendFinalEvents ?? vi.fn(),
    dependencies: {
      agentFactory: controls.agentFactory,
    },
  });
  return { lifecycle, controls };
}

describe("TurnLifecycle", () => {
  it("starts a turn and updates live events", async () => {
    const state = createState();
    const { lifecycle } = createLifecycle({ state });

    await lifecycle.startUserTurn({
      content: "hello",
      mode: "act",
      sessionId: "ses_1",
      workspaceRoot: "/tmp/workspace",
    });
    const run = state.activeRun!;
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
    const state = createState();
    const appendFinalEvents = vi.fn();
    const { lifecycle, controls } = createLifecycle({
      state,
      appendFinalEvents,
    });

    await lifecycle.startUserTurn({
      content: "hello",
      mode: "act",
      sessionId: "ses_1",
      workspaceRoot: "/tmp/workspace",
    });
    const stream = await waitForStream(controls.streams);
    stream.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appendFinalEvents).toHaveBeenCalledWith([
      expect.objectContaining({ type: "user-input" }),
    ]);
    expect(state.isLoading).toBe(false);
    expect(state.activeRun).toBeNull();
  });

  it("ignores stale completions after cancel", async () => {
    const state = createState();
    const appendFinalEvents = vi.fn();
    const { lifecycle, controls } = createLifecycle({
      state,
      appendFinalEvents,
    });

    await lifecycle.startUserTurn({
      content: "hello",
      mode: "act",
      sessionId: "ses_1",
      workspaceRoot: "/tmp/workspace",
    });
    const stream = await waitForStream(controls.streams);
    lifecycle.cancel();
    stream.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appendFinalEvents).not.toHaveBeenCalled();
  });
});
