import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  AgentApplication,
  type AgentSessionStorage,
  type TurnLifecycleDependencies,
  type TurnTransactionRun,
} from "@excelsior/agent-host/testing/application";
import {
  AgentRun,
  type AgentEventDataMap,
  type AnyAgentEvent,
  type RunSessionConfig,
} from "@excelsior/agent-host/testing/runtime";
import {
  JsonlRunRecorder,
  resetSessionsDirForTests,
  setSessionsDirForTests,
} from "@excelsior/agent-host/testing/persistence";
import type { RevertCapability } from "@excelsior/agent-host/testing/tools";
import type { RunCompletion, RunHandle } from "@excelsior/run-runtime";
import {
  createFakeSessionStorage,
  createPendingRunHandle,
  createFakeTurnLifecycle,
} from "./helpers/agentApplication.js";

function completionForEvents(events: Promise<AnyAgentEvent[]>) {
  return events.then((completedEvents) => ({
    status: "completed" as const,
    events: completedEvents,
  }));
}

function createDeferredRunHandle(cancel = vi.fn()): {
  handle: RunHandle<AgentEventDataMap>;
  resolveCompletion(completion: RunCompletion<AgentEventDataMap>): void;
} {
  let resolveCompletion!: (completion: RunCompletion<AgentEventDataMap>) => void;
  const completion = new Promise<RunCompletion<AgentEventDataMap>>((resolve) => {
    resolveCompletion = resolve;
  });
  return {
    handle: {
      completion,
      cancel,
    },
    resolveCompletion,
  };
}

async function waitForIdle(manager: AgentApplication): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!manager.getSnapshot().isLoading) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for agent application to become idle");
}

function createTurnLifecycle(
  createRunSession: (config: RunSessionConfig) => ReturnType<NonNullable<TurnLifecycleDependencies["createRunSession"]>>,
): TurnLifecycleDependencies & { createRunSession: ReturnType<typeof vi.fn> } {
  return { createRunSession: vi.fn(createRunSession) };
}

async function persistRunEvents(sessionId: string, run: AgentRun): Promise<void> {
  const recorder = new JsonlRunRecorder();
  for (const event of run.getSnapshot()) {
    await recorder.recordEvent(sessionId, event);
  }
}

function createWorkspaceSessionStorage(workspaceRoot: string): AgentSessionStorage {
  return createFakeSessionStorage(workspaceRoot);
}

function createCheckpointingTurnLifecycle(): {
  turnLifecycle: TurnLifecycleDependencies;
  getRun(): AgentRun;
  getRevertCapability(): RevertCapability;
  resolveCompletion(completion: RunCompletion<AgentEventDataMap>): void;
} {
  let run: AgentRun | null = null;
  let revert: RevertCapability | null = null;
  let resolveCompletion!: (completion: RunCompletion<AgentEventDataMap>) => void;

  const createRunSession = vi.fn((config: RunSessionConfig) => {
    const sessionId = config.sessionId ?? "ses_test";
    run = new AgentRun(sessionId);
    revert = config.turnTransactions?.beginTurn(sessionId, run.id) ?? null;
    const completion = new Promise<RunCompletion<AgentEventDataMap>>((resolve) => {
        resolveCompletion = resolve;
      }).then(async (result) => {
        if (result.status === "completed" || result.status === "failed") {
          await config.turnTransactions?.completeTurn(
            sessionId,
            run as TurnTransactionRun,
          );
        } else {
          config.turnTransactions?.discardTurn(run!.id);
        }
        return result;
      });
      return {
        run,
        childRuns: new Map(),
        handle: {
          completion,
          cancel: vi.fn(),
        },
        sessionId,
      };
  });

  return {
    turnLifecycle: { createRunSession },
    getRun: () => {
      if (!run) throw new Error("Run not started");
      return run;
    },
    getRevertCapability: () => {
      if (!revert) throw new Error("Revert capability not captured");
      return revert;
    },
    resolveCompletion: (completion) => resolveCompletion(completion),
  };
}

describe("AgentApplication session ownership", () => {
  it("refreshes snapshot after session CRUD with a plain session storage", async () => {
    const sessionStorage = createFakeSessionStorage();
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle: createFakeTurnLifecycle(),
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
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle: TurnLifecycleDependencies & { createRunSession: ReturnType<typeof vi.fn> } = {
      createRunSession: vi.fn((config: RunSessionConfig) => ({
        run: new AgentRun(config.sessionId),
        childRuns: new Map(),
        handle: createPendingRunHandle(),
        sessionId: config.sessionId ?? "ses_test",
      })),
    };
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    manager.send("  review the project architecture  ");

    expect(manager.getSnapshot().sessions[0].title).toBe("review the project architecture");
    expect(turnLifecycle.createRunSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "ses_1" }),
    );
    expect(turnLifecycle.createRunSession.mock.calls[0][0].messages.at(-1)).toEqual({
      role: "user",
      content: "review the project architecture",
    });

    manager.dispose();
  });

  it("merges final run events back into the snapshot before clearing loading state", async () => {
    let run!: AgentRun;
    let resolveEvents!: () => void;
    const events = new Promise<AnyAgentEvent[]>((resolve) => {
      resolveEvents = () => resolve([...run.getSnapshot()]);
    });
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createTurnLifecycle((config) => {
        const sessionId = config.sessionId ?? "ses_test";
        run = new AgentRun(sessionId);
        return {
          run,
          childRuns: new Map(),
          handle: { completion: completionForEvents(events), cancel: vi.fn() },
          sessionId,
        };
      });
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    manager.send("hello");
    expect(manager.getSnapshot().isLoading).toBe(true);

    resolveEvents();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snapshot = manager.getSnapshot();
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.displayBlocks).toEqual([
      expect.objectContaining({ type: "user", content: "hello" }),
    ]);
  });

  it("keeps failed run final events visible before clearing loading state", async () => {
    let run!: AgentRun;
    let resolveCompletion!: (completion: RunCompletion<AgentEventDataMap>) => void;
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createTurnLifecycle((config) => {
        const sessionId = config.sessionId ?? "ses_test";
        run = new AgentRun(sessionId);
        const deferred = createDeferredRunHandle();
        resolveCompletion = deferred.resolveCompletion;
        return {
          run,
          childRuns: new Map(),
          handle: deferred.handle,
          sessionId,
        };
      });
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    manager.send("hello");
    run.emit("error", { message: "model exploded" });
    resolveCompletion({
      status: "failed",
      events: [...run.getSnapshot()],
      error: new Error("model exploded"),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snapshot = manager.getSnapshot();
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.displayBlocks).toEqual([
      expect.objectContaining({ type: "user", content: "hello" }),
      expect.objectContaining({ type: "assistant", content: "Error: model exploded" }),
    ]);
  });

  it("drops partial live events when the active run completes as cancelled", async () => {
    let run!: AgentRun;
    let resolveCompletion!: (completion: RunCompletion<AgentEventDataMap>) => void;
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createTurnLifecycle((config) => {
        const sessionId = config.sessionId ?? "ses_test";
        run = new AgentRun(sessionId);
        const deferred = createDeferredRunHandle();
        resolveCompletion = deferred.resolveCompletion;
        return {
          run,
          childRuns: new Map(),
          handle: deferred.handle,
          sessionId,
        };
      });
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    manager.send("hello");
    expect(manager.getSnapshot().displayBlocks).toHaveLength(1);

    resolveCompletion({ status: "cancelled", events: [...run.getSnapshot()] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snapshot = manager.getSnapshot();
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.displayBlocks).toEqual([]);
  });

  it("clears loading state when the active run is cancelled", () => {
    const cancel = vi.fn();
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createTurnLifecycle((config) => ({
        run: new AgentRun(config.sessionId),
        childRuns: new Map(),
        handle: createPendingRunHandle(cancel),
        sessionId: config.sessionId ?? "ses_test",
      }));
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    manager.send("hello");
    expect(manager.getSnapshot().isLoading).toBe(true);

    manager.cancel();

    expect(cancel).toHaveBeenCalledOnce();
    expect(manager.getSnapshot().isLoading).toBe(false);
  });

  it("ignores stale completions after cancellation", async () => {
    let run!: AgentRun;
    let resolveCompletion!: (completion: RunCompletion<AgentEventDataMap>) => void;
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createTurnLifecycle((config) => {
        const sessionId = config.sessionId ?? "ses_test";
        run = new AgentRun(sessionId);
        const deferred = createDeferredRunHandle();
        resolveCompletion = deferred.resolveCompletion;
        return {
          run,
          childRuns: new Map(),
          handle: deferred.handle,
          sessionId,
        };
      });
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    manager.send("hello");
    manager.cancel();
    resolveCompletion({ status: "completed", events: [...run.getSnapshot()] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(manager.getSnapshot().displayBlocks).toEqual([]);
  });

  it("ignores stale completions when a newer run is active", async () => {
    const runs: AgentRun[] = [];
    const completions: Array<(completion: RunCompletion<AgentEventDataMap>) => void> = [];
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createTurnLifecycle((config) => {
        const sessionId = config.sessionId ?? "ses_test";
        const run = new AgentRun(sessionId);
        const deferred = createDeferredRunHandle();
        runs.push(run);
        completions.push(deferred.resolveCompletion);
        return {
          run,
          childRuns: new Map(),
          handle: deferred.handle,
          sessionId,
        };
      });
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    manager.send("first");
    manager.cancel();
    manager.send("second");

    completions[0]({ status: "completed", events: [...runs[0].getSnapshot()] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manager.getSnapshot().isLoading).toBe(true);

    completions[1]({ status: "completed", events: [...runs[1].getSnapshot()] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(manager.getSnapshot().displayBlocks).toEqual([
      expect.objectContaining({ type: "user", content: "second" }),
    ]);
  });

  it("clears restored display state after deleting the current session", async () => {
    let run!: AgentRun;
    let resolveEvents!: () => void;
    const events = new Promise<AnyAgentEvent[]>((resolve) => {
      resolveEvents = () => resolve([...run.getSnapshot()]);
    });
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createTurnLifecycle((config) => {
        const sessionId = config.sessionId ?? "ses_test";
        run = new AgentRun(sessionId);
        return {
          run,
          childRuns: new Map(),
          handle: { completion: completionForEvents(events), cancel: vi.fn() },
          sessionId,
        };
      });
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    manager.send("hello");
    resolveEvents();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manager.getSnapshot().displayBlocks).toHaveLength(1);

    await manager.deleteSession("ses_1");

    const snapshot = manager.getSnapshot();
    expect(snapshot.currentSessionId).toBeNull();
    expect(snapshot.displayBlocks).toEqual([]);
  });

  it("schedules a snapshot notification when sub-agent events arrive", async () => {
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createTurnLifecycle((config) => {
        return {
          run: new AgentRun(config.sessionId),
          childRuns: new Map(),
          handle: createPendingRunHandle(),
          sessionId: config.sessionId ?? "ses_test",
        };
      });
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });
    const listener = vi.fn();
    manager.subscribe(listener);

    manager.send("hello");
    const callsAfterSend = listener.mock.calls.length;
    const subAgentEvents = turnLifecycle.createRunSession.mock.calls[0][0].subAgentEvents;
    subAgentEvents?.emit("spawned", { toolCallId: "tc1", role: "Bug Hunter" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listener.mock.calls.length).toBeGreaterThan(callsAfterSend);
  });
});

describe("AgentApplication revert", () => {
  let sessionsDir: string;
  let workspaceRoot: string;

  beforeEach(async () => {
    sessionsDir = await mkdtemp(join(tmpdir(), "excelsior-revert-sessions-"));
    workspaceRoot = await mkdtemp(join(tmpdir(), "excelsior-revert-workspace-"));
    setSessionsDirForTests(sessionsDir);
  });

  afterEach(async () => {
    await new JsonlRunRecorder().deleteAllSessionEvents();
    resetSessionsDirForTests();
    await rm(sessionsDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("refuses to revert while a run is active", async () => {
    const controller = createCheckpointingTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage: createWorkspaceSessionStorage(workspaceRoot),
      turnLifecycle: controller.turnLifecycle,
    });

    manager.send("change file");

    await expect(manager.revertLastTurn()).resolves.toMatchObject({
      message: "Cannot revert while a run is active. Cancel it first.",
    });
  });

  it("restores checkpointed files and removes the latest turn from history", async () => {
    const filePath = "demo.txt";
    const fullPath = join(workspaceRoot, filePath);
    await writeFile(fullPath, "original", "utf-8");
    const controller = createCheckpointingTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage: createWorkspaceSessionStorage(workspaceRoot),
      turnLifecycle: controller.turnLifecycle,
    });

    manager.send("change file");
    const run = controller.getRun();
    const revert = controller.getRevertCapability();
    await revert.captureBeforeWrite(filePath, fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    revert.recordWrite(filePath, fullPath, "agent edit");
    await persistRunEvents("ses_1", run);
    controller.resolveCompletion({ status: "completed", events: [...run.getSnapshot()] });
    await waitForIdle(manager);

    const result = await manager.revertLastTurn();

    expect(result.message).toContain("Reverted latest turn");
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("original");
    await expect(new JsonlRunRecorder().loadRawEvents("ses_1")).resolves.toEqual([]);
    expect(manager.getSnapshot().displayBlocks).toEqual([]);
  });

  it("reports conflicts without changing files or history", async () => {
    const filePath = "demo.txt";
    const fullPath = join(workspaceRoot, filePath);
    await writeFile(fullPath, "original", "utf-8");
    const controller = createCheckpointingTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage: createWorkspaceSessionStorage(workspaceRoot),
      turnLifecycle: controller.turnLifecycle,
    });

    manager.send("change file");
    const run = controller.getRun();
    const revert = controller.getRevertCapability();
    await revert.captureBeforeWrite(filePath, fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    revert.recordWrite(filePath, fullPath, "agent edit");
    await persistRunEvents("ses_1", run);
    controller.resolveCompletion({ status: "completed", events: [...run.getSnapshot()] });
    await waitForIdle(manager);
    await writeFile(fullPath, "user edit", "utf-8");

    const result = await manager.revertLastTurn();

    expect(result.message).toContain("Cannot revert");
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("user edit");
    await expect(new JsonlRunRecorder().loadRawEvents("ses_1")).resolves.toHaveLength(2);
  });
});

