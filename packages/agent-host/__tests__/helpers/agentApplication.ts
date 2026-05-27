import { vi } from "vitest";
import type {
  AgentSessionStorage,
  SessionMetadataStore,
  TurnLifecycleDependencies,
} from "@excelsior/agent-host/testing/application";
import {
  AgentRun,
  type AgentEventDataMap,
  type RunSessionConfig,
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
): SessionMetadataStore {
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

export function createFakeTurnLifecycle(
  onRun?: (run: AgentRun, config: RunSessionConfig) => void,
): TurnLifecycleDependencies & { createRunSession: ReturnType<typeof vi.fn> } {
  const createRunSession = vi.fn((config: RunSessionConfig) => {
    const sessionId = config.sessionId ?? "ses_test";
    const run = new AgentRun(sessionId);
    onRun?.(run, config);
    return {
      run,
      childRuns: new Map(),
      handle: createPendingRunHandle(),
      sessionId,
    };
  });

  return { createRunSession };
}
