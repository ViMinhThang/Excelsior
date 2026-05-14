import { describe, expect, it, vi } from "vitest";
import { AgentManager } from "../application/agentManager.js";
import { AgentRun } from "../lib/runtime/agentRun.js";
import type { Session } from "../lib/runtime/session.js";

function makeSession(id: string, title: string): Session {
  return {
    id,
    title,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { userInput: "" },
    workspaceId: "ws_test",
  };
}

function fakeSessionManager() {
  const sessions: Session[] = [];
  let currentSessionId: string | null = null;
  return {
    getCurrentSessionId: () => currentSessionId,
    getWorkspaceId: () => "ws_test",
    getWorkspaceRootPath: () => "/tmp/workspace",
    ensureSession: (title?: string) => {
      if (!currentSessionId) {
        const session = makeSession("ses_1", title ?? "Untitled");
        sessions.push(session);
        currentSessionId = session.id;
      }
      return currentSessionId;
    },
    createSession: (title?: string) => {
      const session = makeSession(`ses_${sessions.length + 1}`, title ?? "Untitled");
      sessions.push(session);
      currentSessionId = session.id;
      return session;
    },
    switchSession: (id: string) => {
      currentSessionId = id;
    },
    deleteSession: (id: string) => {
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

describe("AgentManager session ownership", () => {
  it("refreshes snapshot after session CRUD with a plain SessionManager service", () => {
    const sessionManager = fakeSessionManager();
    const manager = new AgentManager(undefined, {
      sessionManager: sessionManager as any,
      chatService: {} as any,
    });

    const created = manager.createSession("First");
    expect(manager.getSnapshot().sessions.map((s) => s.title)).toEqual(["First"]);
    expect(manager.getSnapshot().currentSessionId).toBe(created.id);

    manager.renameSession(created.id, "Renamed");
    expect(manager.getSnapshot().sessions[0].title).toBe("Renamed");

    manager.deleteSession(created.id);
    expect(manager.getSnapshot().sessions).toEqual([]);
    expect(manager.getSnapshot().currentSessionId).toBeNull();
  });

  it("titles a new session from the first user prompt", () => {
    const sessionManager = fakeSessionManager();
    const chatService = {
      startRun: vi.fn((_content: string, options: any) => ({
        run: new AgentRun(options.sessionId),
        childRuns: new Map(),
        handle: { done: new Promise(() => {}), cancel: vi.fn() },
        sessionId: options.sessionId,
      })),
    };
    const manager = new AgentManager(undefined, {
      sessionManager: sessionManager as any,
      chatService: chatService as any,
    });

    manager.send("  review the project architecture  ");

    expect(manager.getSnapshot().sessions[0].title).toBe("review the project architecture");
    expect(chatService.startRun).toHaveBeenCalledWith(
      "review the project architecture",
      expect.objectContaining({ sessionId: "ses_1" }),
    );

    manager.dispose();
  });
});
