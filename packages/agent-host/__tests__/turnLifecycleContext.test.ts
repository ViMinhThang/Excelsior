import { describe, expect, it, vi } from "vitest";
import {
  AgentStateStore,
  ProjectionService,
  TurnLifecycle,
} from "@excelsior/agent-host/testing/application";
import {
  AgentRun,
  makeEvent,
  type AnyAgentEvent,
  type RunRecorder,
  type RunSessionConfig,
} from "@excelsior/agent-host/testing/runtime";
import { FileCheckpoint } from "@excelsior/agent-host/testing/tools";

function createState(): AgentStateStore {
  return new AgentStateStore(
    {
      workspace: {
        id: "ws_test",
        name: "Test workspace",
        rootPath: "C:/workspace",
      },
    },
    new ProjectionService(),
  );
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

describe("TurnLifecycle context assembly", () => {
  it("builds AI history, run options, and display input behind one lifecycle seam", () => {
    const state = createState();
    state.setPersistedEvents([
      makeEvent("run_1", "user-input", { content: "history user" }, 0),
      makeEvent("run_1", "text-delta", { delta: "history assistant" }, 1),
    ] as AnyAgentEvent[]);
    const subAgentEvents = {
      emit: vi.fn(),
      on: vi.fn(() => () => {}),
    };
    const fileCheckpoint = new FileCheckpoint();
    const configs: RunSessionConfig[] = [];
    let run!: AgentRun;
    const createRunSession = vi.fn((config: RunSessionConfig) => {
      configs.push(config);
      run = new AgentRun(config.sessionId);
      return {
        run,
        childRuns: new Map(),
        handle: {
          completion: new Promise<never>(() => {}),
          cancel: vi.fn(),
        },
        sessionId: config.sessionId ?? run.id,
      };
    });
    const lifecycle = new TurnLifecycle({
      state,
      projection: new ProjectionService(),
      recorder: createRecorder(),
      subAgentEvents,
      fileCheckpoint,
      appendFinalEvents: vi.fn(),
      dependencies: { createRunSession },
    });

    lifecycle.startUserTurn({
      content: "current exact",
      sessionId: "ses_test",
      workspaceRoot: "C:/workspace",
      displayContent: "Displayed request",
      mode: "act",
    });

    const config = configs[0];
    expect(config.messages).toEqual([
      { role: "user", content: "history user" },
      { role: "assistant", content: "history assistant" },
      { role: "user", content: "current exact" },
    ]);
    expect(config.sessionId).toBe("ses_test");
    expect(config.mode).toBe("act");
    expect(config.workspaceRoot).toBe("C:/workspace");
    expect(config.subAgentEvents).toBe(subAgentEvents);
    expect(config.fileCheckpoint).toBe(fileCheckpoint);
    expect(run.getSnapshot()).toEqual([
      expect.objectContaining({
        type: "user-input",
        data: { content: "Displayed request" },
      }),
    ]);
  });
});
