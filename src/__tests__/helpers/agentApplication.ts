import { vi } from "vitest";
import type {
  AgentSessionService,
  ChatTurnService,
} from "@excelsior/agent-host/testing/application";
import {
  AgentRun,
  type AgentEventDataMap,
} from "@excelsior/agent-host/testing/runtime";
import type { Session } from "@excelsior/agent-host/testing/session";
import type { RunHandle } from "@excelsior/run-runtime";

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

export function createFakeSessionManager(): AgentSessionService {
  const sessions: Session[] = [];
  let currentSessionId: string | null = null;

  return {
    getCurrentSessionId: () => currentSessionId,
    getWorkspaceId: () => "ws_test",
    getWorkspace: () => ({
      id: "ws_test",
      name: "Test workspace",
      rootPath: "/tmp/workspace",
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
    renameSession: (id: string, title: string) => {
      const session = sessions.find((s) => s.id === id);
      if (session) session.title = title;
    },
    listSessions: () => [...sessions],
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

export function createFakeChatService(
  onRun?: (run: AgentRun) => void,
): ChatTurnService & { submitUserTurn: ReturnType<typeof vi.fn> } {
  const submitUserTurn = vi.fn((_content, options) => {
    const run = new AgentRun(options.sessionId);
    onRun?.(run);
    return {
      run,
      childRuns: new Map(),
      handle: createPendingRunHandle(),
      sessionId: options.sessionId,
    };
  });

  return { submitUserTurn };
}
