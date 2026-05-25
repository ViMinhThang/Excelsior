import { describe, expect, it, vi } from "vitest";
import {
  SessionStorageCoordinator,
  type SessionMetadataStore,
} from "@excelsior/agent-host/testing/application";
import {
  makeEvent,
  type RunRecorder,
} from "@excelsior/agent-host/testing/runtime";
import type { Session } from "@excelsior/core";

describe("SessionStorageCoordinator", () => {
  it("loads events for the current session", async () => {
    const event = makeEvent("run_1", "user-input", { content: "hello" }, 0);
    const sessions = createMetadataStore("ses_1");
    const loadCompletedEvents = vi.fn(async () => [event]);
    const recorder = createRecorder({
      loadCompletedEvents,
    });
    const storage = new SessionStorageCoordinator({ sessions, recorder });

    await expect(storage.loadCurrentSessionEvents()).resolves.toEqual([event]);
    expect(loadCompletedEvents).toHaveBeenCalledWith("ses_1");
  });

  it("returns no events when there is no current session", async () => {
    const recorder = createRecorder();
    const storage = new SessionStorageCoordinator({
      sessions: createMetadataStore(null),
      recorder,
    });

    await expect(storage.loadCurrentSessionEvents()).resolves.toEqual([]);
    expect(recorder.loadCompletedEvents).not.toHaveBeenCalled();
  });

  it("deletes session metadata and its run events through one interface", async () => {
    const calls: string[] = [];
    const sessions = createMetadataStore("ses_1", calls);
    const recorder = createRecorder({
      deleteSessionEvents: async (sessionId) => {
        calls.push(`events:${sessionId}`);
      },
    });
    const storage = new SessionStorageCoordinator({ sessions, recorder });

    await storage.deleteSession("ses_1");

    expect(calls).toEqual(["session:ses_1", "events:ses_1"]);
  });

  it("deletes all session metadata and all run events through one interface", async () => {
    const calls: string[] = [];
    const sessions = createMetadataStore("ses_1", calls);
    const recorder = createRecorder({
      deleteAllSessionEvents: async () => {
        calls.push("events:all");
      },
    });
    const storage = new SessionStorageCoordinator({ sessions, recorder });

    await storage.deleteAllSessions();

    expect(calls).toEqual(["sessions:all", "events:all"]);
    expect(storage.getCurrentSessionId()).toBeNull();
  });
});

function createMetadataStore(
  initialSessionId: string | null,
  calls: string[] = [],
): SessionMetadataStore {
  let currentSessionId = initialSessionId;
  const sessions: Session[] = initialSessionId
    ? [session(initialSessionId, "Existing")]
    : [];

  return {
    getCurrentSessionId: () => currentSessionId,
    getWorkspaceId: () => "ws_test",
    getWorkspace: () => ({
      id: "ws_test",
      name: "Test workspace",
      rootPath: "/tmp/workspace",
    }),
    ensureSession: (title?: string) => {
      if (currentSessionId) return currentSessionId;
      const created = session("ses_created", title ?? "Untitled");
      sessions.push(created);
      currentSessionId = created.id;
      return created.id;
    },
    createSession: (title?: string) => {
      const created = session(`ses_${sessions.length + 1}`, title ?? "Untitled");
      sessions.push(created);
      currentSessionId = created.id;
      return created;
    },
    switchSession: (sessionId: string) => {
      currentSessionId = sessionId;
    },
    deleteSession: async (sessionId: string) => {
      calls.push(`session:${sessionId}`);
      const index = sessions.findIndex((item) => item.id === sessionId);
      if (index !== -1) sessions.splice(index, 1);
      if (currentSessionId === sessionId) currentSessionId = null;
    },
    deleteAllSessions: async () => {
      calls.push("sessions:all");
      sessions.splice(0, sessions.length);
      currentSessionId = null;
    },
    renameSession: (sessionId: string, title: string) => {
      const existing = sessions.find((item) => item.id === sessionId);
      if (existing) existing.title = title;
    },
    listSessions: () => [...sessions],
  };
}

function createRecorder(overrides: Partial<RunRecorder> = {}): RunRecorder {
  return {
    recordEvent: vi.fn(async () => {}),
    recordTurnComplete: vi.fn(async () => {}),
    loadCompletedEvents: vi.fn(async () => []),
    loadRawEvents: vi.fn(async () => []),
    getLastCompletedTurn: vi.fn(async () => null),
    dropLastCompletedTurn: vi.fn(async () => ({
      dropped: false,
      removedEvents: 0,
      reason: "no-completed-turn" as const,
    })),
    deleteSessionEvents: vi.fn(async () => {}),
    deleteAllSessionEvents: vi.fn(async () => {}),
    ...overrides,
  };
}

function session(id: string, title: string): Session {
  return {
    id,
    title,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { userInput: "" },
    workspaceId: "ws_test",
  };
}
