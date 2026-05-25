import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  AgentStateStore,
  ProjectionService,
  RevertController,
  SessionController,
} from "@excelsior/agent-host/testing/application";
import type { RunRecorder } from "@excelsior/agent-host/testing/runtime";
import { FileCheckpoint } from "@excelsior/agent-host/testing/tools";
import { createFakeSessionManager } from "./helpers/agentApplication.js";

describe("RevertController", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "excelsior-revert-controller-"));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  function createHarness(recorder: RunRecorder) {
    const state = new AgentStateStore(
      {
        workspace: {
          id: "ws_test",
          name: "Test workspace",
          rootPath: workspaceRoot,
        },
      },
      new ProjectionService(),
    );
    const sessionManager = createFakeSessionManager();
    const sessions = new SessionController(
      sessionManager,
      recorder,
      state,
      () => {},
    );
    sessions.createSession("Test");
    const fileCheckpoint = new FileCheckpoint();
    const controller = new RevertController(
      state,
      sessions,
      recorder,
      fileCheckpoint,
    );
    return { controller, fileCheckpoint, state };
  }

  it("refuses while a run is active", async () => {
    const recorder = createRecorder();
    const { controller, state } = createHarness(recorder);
    state.setLoading(true);

    await expect(controller.revertLastTurn()).resolves.toMatchObject({
      message: "Cannot revert while a run is active. Cancel it first.",
    });
  });

  it("restores files and trims latest history", async () => {
    const fullPath = join(workspaceRoot, "demo.txt");
    await writeFile(fullPath, "original", "utf-8");
    const recorder = createRecorder("run_1");
    const { controller, fileCheckpoint } = createHarness(recorder);
    fileCheckpoint.beginTurn("ses_1", "run_1");
    await fileCheckpoint.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    fileCheckpoint.recordWrite("demo.txt", fullPath, "agent edit");
    fileCheckpoint.completeTurn("ses_1", "run_1");

    const result = await controller.revertLastTurn();

    expect(result.message).toContain("Reverted latest turn");
    expect(recorder.dropLastCompletedTurn).toHaveBeenCalledWith("ses_1", "run_1");
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("original");
  });

  it("leaves history untouched on file conflicts", async () => {
    const fullPath = join(workspaceRoot, "demo.txt");
    await writeFile(fullPath, "original", "utf-8");
    const recorder = createRecorder("run_1");
    const { controller, fileCheckpoint } = createHarness(recorder);
    fileCheckpoint.beginTurn("ses_1", "run_1");
    await fileCheckpoint.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    fileCheckpoint.recordWrite("demo.txt", fullPath, "agent edit");
    fileCheckpoint.completeTurn("ses_1", "run_1");
    await writeFile(fullPath, "user edit", "utf-8");

    const result = await controller.revertLastTurn();

    expect(result.message).toContain("Cannot revert");
    expect(recorder.dropLastCompletedTurn).not.toHaveBeenCalled();
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("user edit");
  });
});

function createRecorder(runId?: string): RunRecorder {
  return {
    recordEvent: async () => {},
    recordTurnComplete: async () => {},
    loadCompletedEvents: async () => [],
    loadRawEvents: async () => [],
    getLastCompletedTurn: async () =>
      runId ? { runId, checkpointIndex: 0, eventCount: 1 } : null,
    dropLastCompletedTurn: vi.fn(async () => ({
      dropped: true,
      runId,
      removedEvents: 1,
    })),
    deleteSessionEvents: async () => {},
    deleteAllSessionEvents: async () => {},
  };
}
