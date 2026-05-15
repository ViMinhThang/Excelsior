import { describe, expect, it, vi } from "vitest";
import { AgentManager } from "../../packages/agent-host/src/application/agentManager.js";
import { AgentRun } from "../../packages/agent-host/src/lib/runtime/agentRun.js";
import type { Session } from "../../packages/agent-host/src/lib/runtime/session.js";

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
  it("refreshes snapshot after session CRUD with a plain SessionManager service", async () => {
    const sessionManager = fakeSessionManager();
    const manager = new AgentManager(undefined, {
      sessionManager: sessionManager as any,
      chatService: {} as any,
    });

    const created = manager.createSession("First");
    expect(manager.getSnapshot().sessions.map((s) => s.title)).toEqual(["First"]);
    expect(manager.getSnapshot().currentSessionId).toBe(created.id);
    expect(manager.getSnapshot().workspace).toEqual({
      id: "ws_test",
      name: "Test workspace",
      rootPath: "/tmp/workspace",
    });

    manager.renameSession(created.id, "Renamed");
    expect(manager.getSnapshot().sessions[0].title).toBe("Renamed");

    await manager.deleteSession(created.id);
    expect(manager.getSnapshot().sessions).toEqual([]);
    expect(manager.getSnapshot().currentSessionId).toBeNull();
  });

  it("creates an untitled session when send is called without a title", () => {
    const sessionManager = fakeSessionManager();
    const chatService = {
      submitUserTurn: vi.fn((_content: string, options: any) => ({
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

    expect(manager.getSnapshot().sessions[0].title).toBe("Untitled");
    expect(chatService.submitUserTurn).toHaveBeenCalledWith(
      "review the project architecture",
      expect.objectContaining({ sessionId: "ses_1" }),
    );

    manager.dispose();
  });
});
