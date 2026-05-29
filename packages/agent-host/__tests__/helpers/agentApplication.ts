import { vi } from "vitest";
import type { AgentMessage } from "@excelsior/core";
import type {
  CreateAgentFunction,
  AgentSessionStorage,
  TurnLifecycleDependencies,
} from "@excelsior/agent-host/testing/application";
import {
  AgentRun,
  type AgentEventDataMap,
  type RunContext,
} from "@excelsior/agent-host/testing/runtime";
import type { Session } from "@excelsior/agent-host/testing/session";
import type { RunHandle } from "@excelsior/run-runtime";
import { JsonlRunRecorder } from "../../src/persistence/runRecorder.js";

export function makeSession(id: string, title: string): Session {
  return {
    id,
    title,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { userInput: "" },
    workspaceId: "ws_test",
  };
}

export function createFakeSessionManager(
  workspaceRoot = "/tmp/workspace",
) {
  const sessions: Session[] = [];
  let currentSessionId: string | null = null;

  return {
    getCurrentSessionId: () => currentSessionId,
    getWorkspaceId: () => "ws_test",
    getWorkspace: () => ({
      id: "ws_test",
      name: "Test workspace",
      rootPath: workspaceRoot,
    }),
    ensureSession: (title?: string) => {
      if (!currentSessionId) {
        const session = makeSession("ses_1", title ?? "Untitled");
        sessions.push(session);
        currentSessionId = session.id;
      }
      return currentSessionId;
    },
    createSession: (title?: string) => {
      const session = makeSession(
        `ses_${sessions.length + 1}`,
        title ?? "Untitled",
      );
      sessions.push(session);
      currentSessionId = session.id;
      return session;
    },
    switchSession: (id: string) => {
      currentSessionId = id;
    },
    deleteSession: async (id: string) => {
      const index = sessions.findIndex((session) => session.id === id);
      if (index !== -1) sessions.splice(index, 1);
      if (currentSessionId === id) currentSessionId = null;
    },
    deleteAllSessions: async () => {
      sessions.splice(0, sessions.length);
      currentSessionId = null;
    },
    renameSession: (id: string, title: string) => {
      const session = sessions.find((s) => s.id === id);
      if (session) session.title = title;
    },
    listSessions: () => [...sessions],
  };
}

export function createFakeSessionStorage(
  workspaceRoot = "/tmp/workspace",
  recorder = new JsonlRunRecorder(),
): AgentSessionStorage {
  const sessions = createFakeSessionManager(workspaceRoot);
  return {
    ...sessions,
    loadCurrentSessionEvents: async () => [],
    getLastCompletedTurn: (sessionId) => recorder.getLastCompletedTurn(sessionId),
    trimLastCompletedTurn: (sessionId, expectedRunId) => recorder.dropLastCompletedTurn(sessionId, expectedRunId),
    recordTurnComplete: (sessionId, runId, sequence) => recorder.recordTurnComplete(sessionId, runId, sequence),
  };
}

export function createPendingRunHandle(
  cancel = vi.fn(),
): RunHandle<AgentEventDataMap> {
  return {
    completion: new Promise(() => {}),
    cancel,
  };
}

export interface FakeAgentStream {
  run: AgentRun;
  runContext: RunContext;
  messages: unknown[] | null;
  resolve(): void;
  reject(error: unknown): void;
}

export interface FakeTurnLifecycle extends TurnLifecycleDependencies {
  createAgent: CreateAgentFunction & ReturnType<typeof vi.fn>;
  streams: FakeAgentStream[];
}

export function createFakeTurnLifecycle(
  onRun?: (run: AgentRun, context: RunContext) => void,
): FakeTurnLifecycle {
  const streams: FakeAgentStream[] = [];
  const createAgent = vi.fn((runContext: RunContext) => {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const completion = new Promise<void>((finish, fail) => {
      resolve = finish;
      reject = fail;
    });
    const stream: FakeAgentStream = {
      run: runContext.run,
      runContext,
      messages: null,
      resolve,
      reject,
    };
    streams.push(stream);
    onRun?.(runContext.run, runContext);
    return {
      stream: async ({ messages }: { messages: AgentMessage[] }) => {
        stream.messages = messages;
        await completion;
      },
    };
  });

  return { createAgent, streams };
}

export async function waitForFakeAgentStream(
  lifecycle: FakeTurnLifecycle,
  index = 0,
): Promise<FakeAgentStream> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const stream = lifecycle.streams[index];
    if (stream) return stream;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for fake agent stream");
}
