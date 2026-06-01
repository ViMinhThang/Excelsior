import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { resetDb, storageEngine } from "@excelsior/agent-storage";
import { SessionManager } from "@excelsior/agent-host/testing/session";
import { makeEvent } from "@excelsior/agent-host/testing/runtime";
import { createFakeRunRecorder } from "./helpers/agentApplication.js";

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
    const manager = new SessionManager(undefined, storageEngine, createFakeRunRecorder());
    const created = manager.createSession();

    manager.ensureSession("first real prompt");

    const saved = manager.listSessions().find((session) => session.id === created.id);
    expect(saved?.title).toBe("first real prompt");
  });

  it("creates sessions through injected time and id policy", () => {
    const manager = new SessionManager(
      undefined,
      storageEngine,
      createFakeRunRecorder(),
      {
        createSessionId: () => "ses_fixed",
        nowIso: () => "2026-05-18T12:00:00.000Z",
      },
    );

    expect(manager.createSession("fixed")).toMatchObject({
      id: "ses_fixed",
      startedAt: "2026-05-18T12:00:00.000Z",
      updatedAt: "2026-05-18T12:00:00.000Z",
      title: "fixed",
    });
  });

  it("loads events for the current session", async () => {
    const event = makeEvent("run_1", "user-input", { content: "hello" }, 0);
    const loadCompletedEvents = vi.fn(async () => [event]);
    const recorder = createFakeRunRecorder({
      loadCompletedEvents,
    });
    const manager = new SessionManager(undefined, storageEngine, recorder);
    const created = manager.createSession();

    await expect(manager.loadCurrentSessionEvents()).resolves.toEqual([event]);
    expect(loadCompletedEvents).toHaveBeenCalledWith(created.id);
  });

  it("returns no events when there is no current session", async () => {
    const recorder = createFakeRunRecorder();
    const manager = new SessionManager(undefined, storageEngine, recorder);

    await expect(manager.loadCurrentSessionEvents()).resolves.toEqual([]);
    expect(recorder.loadCompletedEvents).not.toHaveBeenCalled();
  });

  it("deletes session metadata and its run events through one interface", async () => {
    const deleteSessionEvents = vi.fn(async () => {});
    const recorder = createFakeRunRecorder({ deleteSessionEvents });
    const manager = new SessionManager(undefined, storageEngine, recorder);
    
    const created = manager.createSession();
    await manager.deleteSession(created.id);

    expect(deleteSessionEvents).toHaveBeenCalledWith(created.id);
    expect(manager.listSessions().find((s) => s.id === created.id)).toBeUndefined();
  });

  it("deletes all session metadata and all run events through one interface", async () => {
    const deleteAllSessionEvents = vi.fn(async () => {});
    const recorder = createFakeRunRecorder({ deleteAllSessionEvents });
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
    
    const recorder = createFakeRunRecorder({
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
