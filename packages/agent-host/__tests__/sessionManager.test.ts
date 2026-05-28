import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { resetDb, storageEngine } from "@excelsior/agent-host/testing/persistence";
import { SessionManager } from "@excelsior/agent-host/testing/session";
import { makeEvent, type RunRecorder } from "@excelsior/agent-host/testing/runtime";

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

describe("SessionManager", () => {
  let tempDir: string;
  const previousDbPath = process.env.EXCELSIOR_DB_PATH;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "excelsior-session-manager-"));
    process.env.EXCELSIOR_DB_PATH = join(tempDir, "index.db");
    resetDb();
  });

  afterEach(async () => {
    resetDb();
    if (previousDbPath === undefined) {
      delete process.env.EXCELSIOR_DB_PATH;
    } else {
      process.env.EXCELSIOR_DB_PATH = previousDbPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("retitles an empty current session from its first user prompt", () => {
    const manager = new SessionManager(undefined, storageEngine, createRecorder());
    const created = manager.createSession();

    manager.ensureSession("first real prompt");

    const saved = manager.listSessions().find((session) => session.id === created.id);
    expect(saved?.title).toBe("first real prompt");
  });

  it("loads events for the current session", async () => {
    const event = makeEvent("run_1", "user-input", { content: "hello" }, 0);
    const loadCompletedEvents = vi.fn(async () => [event]);
    const recorder = createRecorder({
      loadCompletedEvents,
    });
    const manager = new SessionManager(undefined, storageEngine, recorder);
    const created = manager.createSession();

    await expect(manager.loadCurrentSessionEvents()).resolves.toEqual([event]);
    expect(loadCompletedEvents).toHaveBeenCalledWith(created.id);
  });

  it("returns no events when there is no current session", async () => {
    const recorder = createRecorder();
    const manager = new SessionManager(undefined, storageEngine, recorder);

    await expect(manager.loadCurrentSessionEvents()).resolves.toEqual([]);
    expect(recorder.loadCompletedEvents).not.toHaveBeenCalled();
  });

  it("deletes session metadata and its run events through one interface", async () => {
    const deleteSessionEvents = vi.fn(async () => {});
    const recorder = createRecorder({ deleteSessionEvents });
    const manager = new SessionManager(undefined, storageEngine, recorder);
    
    const created = manager.createSession();
    await manager.deleteSession(created.id);

    expect(deleteSessionEvents).toHaveBeenCalledWith(created.id);
    expect(manager.listSessions().find((s) => s.id === created.id)).toBeUndefined();
  });

  it("deletes all session metadata and all run events through one interface", async () => {
    const deleteAllSessionEvents = vi.fn(async () => {});
    const recorder = createRecorder({ deleteAllSessionEvents });
    const manager = new SessionManager(undefined, storageEngine, recorder);
    
    manager.createSession();
    await manager.deleteAllSessions();

    expect(deleteAllSessionEvents).toHaveBeenCalled();
    expect(manager.getCurrentSessionId()).toBeNull();
    expect(manager.listSessions()).toHaveLength(0);
  });

  it("delegates getLastCompletedTurn, trimLastCompletedTurn, and recordTurnComplete to recorder", async () => {
    const getLastCompletedTurn = vi.fn(async () => ({
      runId: "run_1",
      eventCount: 2,
      checkpointIndex: 3,
    }));
    const dropLastCompletedTurn = vi.fn(async () => ({
      dropped: true,
      removedEvents: 2,
    }));
    const recordTurnComplete = vi.fn(async () => {});
    
    const recorder = createRecorder({
      getLastCompletedTurn,
      dropLastCompletedTurn,
      recordTurnComplete,
    });
    
    const manager = new SessionManager(undefined, storageEngine, recorder);

    await expect(manager.getLastCompletedTurn("ses_1")).resolves.toEqual({
      runId: "run_1",
      eventCount: 2,
      checkpointIndex: 3,
    });
    expect(getLastCompletedTurn).toHaveBeenCalledWith("ses_1");

    await expect(manager.trimLastCompletedTurn("ses_1", "run_1")).resolves.toEqual({
      dropped: true,
      removedEvents: 2,
    });
    expect(dropLastCompletedTurn).toHaveBeenCalledWith("ses_1", "run_1");

    await manager.recordTurnComplete("ses_1", "run_1", 5);
    expect(recordTurnComplete).toHaveBeenCalledWith("ses_1", "run_1", 5);
  });
});
