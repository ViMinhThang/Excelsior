import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  TurnTransactionCoordinator,
  AgentStateStore,
  type AgentSessionStorage,
  type TurnTransactionRun,
} from "@excelsior/agent-host/testing/application";
import {
  makeEvent,
  PERSISTENCE_ERROR,
  type AnyAgentEvent,
  type RunRecorder,
} from "@excelsior/agent-host/testing/runtime";

describe("TurnTransactionCoordinator", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "excelsior-turn-transaction-"));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("captures the first file version once per turn", async () => {
    const fullPath = join(workspaceRoot, "demo.txt");
    await writeFile(fullPath, "original", "utf-8");
    const recorder = createRecorder({ latestRunId: "run_1" });
    const transactions = new TurnTransactionCoordinator({ recorder });
    const revert = transactions.beginTurn("ses_1", "run_1");

    await revert.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "first edit", "utf-8");
    revert.recordWrite("demo.txt", fullPath, "first edit");
    await revert.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "second edit", "utf-8");
    revert.recordWrite("demo.txt", fullPath, "second edit");
    await transactions.completeTurn("ses_1", fakeRun("run_1"));

    await expect(transactions.revertLatestTurn("ses_1")).resolves.toMatchObject({
      type: "reverted",
      restoredFilePaths: ["demo.txt"],
    });
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("original");
  });

  it("records turn completion for completed and failed turns", async () => {
    const recorder = createRecorder();
    const transactions = new TurnTransactionCoordinator({ recorder });
    const event = makeEvent("run_1", "text-delta", { delta: "hello" }, 1);

    await transactions.completeTurn("ses_1", fakeRun("run_1", [event]));
    await transactions.completeTurn("ses_1", fakeRun("run_2"));

    expect(recorder.recordTurnComplete).toHaveBeenNthCalledWith(
      1,
      "ses_1",
      "run_1",
      2,
    );
    expect(recorder.recordTurnComplete).toHaveBeenNthCalledWith(
      2,
      "ses_1",
      "run_2",
      0,
    );
  });

  it("emits a persistence warning when turn completion cannot be recorded", async () => {
    const recorder = createRecorder({
      recordTurnComplete: async () => {
        throw new Error("disk full");
      },
    });
    const transactions = new TurnTransactionCoordinator({ recorder });
    const run = fakeRun("run_1");

    await transactions.completeTurn("ses_1", run);

    expect(run.emit).toHaveBeenCalledWith(PERSISTENCE_ERROR, {
      message: "Failed to persist turn checkpoint: disk full",
      failedEventType: "turn-complete",
    });
  });

  it("discards active file checkpoints for cancelled or thrown turns", async () => {
    const fullPath = join(workspaceRoot, "demo.txt");
    await writeFile(fullPath, "original", "utf-8");
    const transactions = new TurnTransactionCoordinator({
      recorder: createRecorder({ latestRunId: "run_1" }),
    });
    const revert = transactions.beginTurn("ses_1", "run_1");

    await revert.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    revert.recordWrite("demo.txt", fullPath, "agent edit");
    transactions.discardTurn("run_1");

    await expect(transactions.revertLatestTurn("ses_1")).resolves.toEqual({
      type: "no-checkpoint",
    });
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("agent edit");
  });

  it("reports no checkpoint, no history, and history mismatch", async () => {
    const noCheckpoint = new TurnTransactionCoordinator({
      recorder: createRecorder({ latestRunId: "run_1" }),
    });
    await expect(noCheckpoint.revertLatestTurn("ses_1")).resolves.toEqual({
      type: "no-checkpoint",
    });

    const noHistoryPath = join(workspaceRoot, "no-history.txt");
    await writeFile(noHistoryPath, "original", "utf-8");
    const noHistory = new TurnTransactionCoordinator({ recorder: createRecorder() });
    const noHistoryRevert = noHistory.beginTurn("ses_1", "run_1");
    await noHistoryRevert.captureBeforeWrite("no-history.txt", noHistoryPath);
    await writeFile(noHistoryPath, "agent edit", "utf-8");
    noHistoryRevert.recordWrite("no-history.txt", noHistoryPath, "agent edit");
    await noHistory.completeTurn("ses_1", fakeRun("run_1"));
    await expect(noHistory.revertLatestTurn("ses_1")).resolves.toEqual({
      type: "no-history",
    });

    const mismatchPath = join(workspaceRoot, "mismatch.txt");
    await writeFile(mismatchPath, "original", "utf-8");
    const mismatch = new TurnTransactionCoordinator({
      recorder: createRecorder({ latestRunId: "run_2" }),
    });
    const mismatchRevert = mismatch.beginTurn("ses_1", "run_1");
    await mismatchRevert.captureBeforeWrite("mismatch.txt", mismatchPath);
    await writeFile(mismatchPath, "agent edit", "utf-8");
    mismatchRevert.recordWrite("mismatch.txt", mismatchPath, "agent edit");
    await mismatch.completeTurn("ses_1", fakeRun("run_1"));
    await expect(mismatch.revertLatestTurn("ses_1")).resolves.toEqual({
      type: "history-mismatch",
    });
  });

  it("reports conflicts without trimming history", async () => {
    const fullPath = join(workspaceRoot, "demo.txt");
    await writeFile(fullPath, "original", "utf-8");
    const recorder = createRecorder({ latestRunId: "run_1" });
    const transactions = new TurnTransactionCoordinator({ recorder });
    const revert = transactions.beginTurn("ses_1", "run_1");

    await revert.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    revert.recordWrite("demo.txt", fullPath, "agent edit");
    await transactions.completeTurn("ses_1", fakeRun("run_1"));
    await writeFile(fullPath, "user edit", "utf-8");

    await expect(transactions.revertLatestTurn("ses_1")).resolves.toEqual({
      type: "conflicts",
      filePaths: ["demo.txt"],
    });
    expect(recorder.dropLastCompletedTurn).not.toHaveBeenCalled();
  });

  it("reports trim failure after restoring files", async () => {
    const fullPath = join(workspaceRoot, "demo.txt");
    await writeFile(fullPath, "original", "utf-8");
    const transactions = new TurnTransactionCoordinator({
      recorder: createRecorder({
        latestRunId: "run_1",
        dropResult: { dropped: false, removedEvents: 0, reason: "latest-turn-mismatch" },
      }),
    });
    const revert = transactions.beginTurn("ses_1", "run_1");

    await revert.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    revert.recordWrite("demo.txt", fullPath, "agent edit");
    await transactions.completeTurn("ses_1", fakeRun("run_1"));

    await expect(transactions.revertLatestTurn("ses_1")).resolves.toEqual({
      type: "trim-failed",
      restoredFilePaths: ["demo.txt"],
    });
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("original");
  });

  it("revertLastTurn refuses while a run is active", async () => {
    const recorder = createRecorder();
    const transactions = new TurnTransactionCoordinator({ recorder });
    const state = new AgentStateStore(
      {
        workspace: {
          id: "ws_test",
          name: "Test workspace",
          rootPath: workspaceRoot,
        },
      },
      new (class {} as any)(),
    );
    state.setLoading(true);

    const sessionStorage = {
      getCurrentSessionId: () => "ses_1",
    } as any;

    await expect(transactions.revertLastTurn(state, sessionStorage)).resolves.toMatchObject({
      message: "Cannot revert while a run is active. Cancel it first.",
    });
  });

  it("revertLastTurn successfully restores files, trims history, reloads events and formats result", async () => {
    const fullPath = join(workspaceRoot, "demo.txt");
    await writeFile(fullPath, "original", "utf-8");
    const recorder = createRecorder({ latestRunId: "run_1" });
    const transactions = new TurnTransactionCoordinator({ recorder });
    const state = new AgentStateStore(
      {
        workspace: {
          id: "ws_test",
          name: "Test workspace",
          rootPath: workspaceRoot,
        },
      },
      new (class {} as any)(),
    );
    
    const events: AnyAgentEvent[] = [];
    const sessionStorage = {
      getCurrentSessionId: () => "ses_1",
      loadCurrentSessionEvents: vi.fn(async () => events),
    } as any;

    const revert = transactions.beginTurn("ses_1", "run_1");
    await revert.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    revert.recordWrite("demo.txt", fullPath, "agent edit");
    await transactions.completeTurn("ses_1", fakeRun("run_1"));

    const result = await transactions.revertLastTurn(state, sessionStorage);

    expect(result.message).toContain("Reverted latest turn and restored 1 file");
    expect(sessionStorage.loadCurrentSessionEvents).toHaveBeenCalled();
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("original");
  });

  it("revertLastTurn formats file conflict message properly", async () => {
    const fullPath = join(workspaceRoot, "demo.txt");
    await writeFile(fullPath, "original", "utf-8");
    const recorder = createRecorder({ latestRunId: "run_1" });
    const transactions = new TurnTransactionCoordinator({ recorder });
    const state = new AgentStateStore(
      {
        workspace: {
          id: "ws_test",
          name: "Test workspace",
          rootPath: workspaceRoot,
        },
      },
      new (class {} as any)(),
    );
    
    const sessionStorage = {
      getCurrentSessionId: () => "ses_1",
    } as any;

    const revert = transactions.beginTurn("ses_1", "run_1");
    await revert.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    revert.recordWrite("demo.txt", fullPath, "agent edit");
    await transactions.completeTurn("ses_1", fakeRun("run_1"));
    await writeFile(fullPath, "user edit", "utf-8");

    const result = await transactions.revertLastTurn(state, sessionStorage);

    expect(result.message).toContain("Cannot revert because 1 file(s) changed after the turn");
  });
});

function fakeRun(
  runId: string,
  events: AnyAgentEvent[] = [],
): TurnTransactionRun {
  return {
    id: runId,
    getSnapshot: () => events,
    emit: vi.fn(),
  };
}

function createRecorder(options?: {
  latestRunId?: string;
  dropResult?: Awaited<ReturnType<RunRecorder["dropLastCompletedTurn"]>>;
  recordTurnComplete?: RunRecorder["recordTurnComplete"];
}): RunRecorder {
  return {
    recordEvent: vi.fn(async () => {}),
    recordTurnComplete: vi.fn(options?.recordTurnComplete ?? (async () => {})),
    loadCompletedEvents: vi.fn(async () => []),
    loadRawEvents: vi.fn(async () => []),
    getLastCompletedTurn: vi.fn(async () =>
      options?.latestRunId
        ? { runId: options.latestRunId, checkpointIndex: 0, eventCount: 1 }
        : null,
    ),
    dropLastCompletedTurn: vi.fn(async () =>
      options?.dropResult ?? {
        dropped: true,
        runId: options?.latestRunId,
        removedEvents: 1,
      },
    ),
    deleteSessionEvents: vi.fn(async () => {}),
    deleteAllSessionEvents: vi.fn(async () => {}),
  } as any;
}
