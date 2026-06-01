import { describe, expect, it, vi } from "vitest";
import type { AgentMessage, Session } from "@excelsior/core";
import {
  AgentStateStore,
  type AgentFactory,
  ProjectionPolicy,
  TurnLifecycle,
  type AgentSessionStorage,
} from "@excelsior/agent-host/testing/application";
import {
  makeEvent,
  type AnyAgentEvent,
  type RunContext,
} from "@excelsior/agent-host/testing/runtime";
import { createFakeRunRecorder } from "./helpers/agentApplication.js";

function createState(): AgentStateStore {
  return new AgentStateStore(
    {
      workspace: {
        id: "ws_test",
        name: "Test workspace",
        rootPath: "C:/workspace",
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

describe("TurnLifecycle context assembly", () => {
  it("builds AI history, run options, and display input behind one lifecycle seam", async () => {
    const state = createState();
    state.setPersistedEvents([
      makeEvent("run_1", "user-input", { content: "history user" }, 0),
      makeEvent("run_1", "text-delta", { delta: "history assistant" }, 1),
    ] as AnyAgentEvent[]);
    const subAgentEvents = {
      emit: vi.fn(),
      on: vi.fn(() => () => {}),
    };
    const recorder = createFakeRunRecorder();
    let seenMessages: AgentMessage[] = [];
    let seenRunContext: RunContext | undefined;
    const agentFactory: AgentFactory = {
      create: vi.fn((input) => {
        seenRunContext = input.runContext;
        return {
          stream: async ({ messages }: { messages: AgentMessage[] }) => {
            seenMessages = messages;
            await new Promise<never>(() => {});
          },
        };
      }),
    };
    const lifecycle = new TurnLifecycle({
      state,
      projection: new ProjectionPolicy(),
      recorder,
      subAgentEvents,
      sessionStorage: createSessionStorage(),
      appendFinalEvents: vi.fn(),
      dependencies: { agentFactory },
    });

    lifecycle.startUserTurn({
      content: "current exact",
      sessionId: "ses_test",
      workspaceRoot: "C:/workspace",
      displayContent: "Displayed request",
      mode: "act",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seenMessages).toEqual([
      { role: "user", content: "history user" },
      { role: "assistant", content: "history assistant" },
      { role: "user", content: "current exact" },
    ]);
    expect(seenRunContext?.run.sessionId).toBe("ses_test");
    expect(seenRunContext?.ctx.mode).toBe("act");
    expect(seenRunContext?.ctx.workspaceRoot).toBe("C:/workspace");
    expect(seenRunContext?.subAgentEvents).toBe(subAgentEvents);
    expect(seenRunContext?.ctx.revert).toBeDefined();
    expect(seenRunContext?.run.getSnapshot()).toEqual([
      expect.objectContaining({
        type: "user-input",
        data: { content: "Displayed request" },
      }),
    ]);
  });
});
