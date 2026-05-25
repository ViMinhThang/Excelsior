import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  AgentApplication,
  type AgentSessionService,
  type ChatTurnService,
} from "@excelsior/agent-host/testing/application";
import {
  AgentRun,
  type AgentEventDataMap,
  type AnyAgentEvent,
  type SubAgentEventSink,
} from "@excelsior/agent-host/testing/runtime";
import {
  JsonlRunRecorder,
  resetSessionsDirForTests,
  setSessionsDirForTests,
} from "@excelsior/agent-host/testing/persistence";
import type { FileCheckpoint } from "@excelsior/agent-host/testing/tools";
import type { RunCompletion, RunHandle } from "@excelsior/run-runtime";
import {
  createFakeChatService,
  createFakeSessionManager,
  createPendingRunHandle,
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

async function persistCompletedRun(sessionId: string, run: AgentRun): Promise<void> {
  const recorder = new JsonlRunRecorder();
  for (const event of run.getSnapshot()) {
    await recorder.recordEvent(sessionId, event);
  }
  await recorder.recordTurnComplete(
    sessionId,
    run.id,
    run.getSnapshot().reduce((max, event) => Math.max(max, event.sequence), -1) + 1,
  );
}

function createWorkspaceSessionManager(workspaceRoot: string): AgentSessionService {
  const sessionManager = createFakeSessionManager();
  return {
    ...sessionManager,
    getWorkspace: () => ({
      id: "ws_test",
      name: "Test workspace",
      rootPath: workspaceRoot,
    }),
  };
}

function createCheckpointingChatService(): {
  chatService: ChatTurnService;
  getRun(): AgentRun;
  getFileCheckpoint(): FileCheckpoint;
  resolveCompletion(completion: RunCompletion<AgentEventDataMap>): void;
} {
  let run: AgentRun | null = null;
  let fileCheckpoint: FileCheckpoint | null = null;
  let resolveCompletion!: (completion: RunCompletion<AgentEventDataMap>) => void;

  const chatService: ChatTurnService = {
    submitUserTurn: vi.fn((_content, options) => {
      run = new AgentRun(options.sessionId);
      fileCheckpoint = options.fileCheckpoint ?? null;
      fileCheckpoint?.beginTurn(options.sessionId, run.id);
      const completion = new Promise<RunCompletion<AgentEventDataMap>>((resolve) => {
        resolveCompletion = resolve;
      }).then((result) => {
        if (result.status === "completed" || result.status === "failed") {
          fileCheckpoint?.completeTurn(options.sessionId, run!.id);
        } else {
          fileCheckpoint?.discardActiveTurn(run!.id);
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
        sessionId: options.sessionId,
      };
    }),
  };

  return {
    chatService,
    getRun: () => {
      if (!run) throw new Error("Run not started");
      return run;
    },
    getFileCheckpoint: () => {
      if (!fileCheckpoint) throw new Error("File checkpoint not captured");
      return fileCheckpoint;
    },
    resolveCompletion: (completion) => resolveCompletion(completion),
  };
}

describe("AgentApplication session ownership", () => {
  it("refreshes snapshot after session CRUD with a plain SessionManager service", async () => {
    const sessionManager = createFakeSessionManager();
    const manager = new AgentApplication(undefined, {
      sessionManager,
      chatService: createFakeChatService(),
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
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => ({
        run: new AgentRun(options.sessionId),
        childRuns: new Map(),
        handle: createPendingRunHandle(),
        sessionId: options.sessionId,
      })),
    };
    const manager = new AgentApplication(undefined, {
      sessionManager,
      chatService,
    });

    manager.send("  review the project architecture  ");

    expect(manager.getSnapshot().sessions[0].title).toBe("review the project architecture");
    expect(chatService.submitUserTurn).toHaveBeenCalledWith(
      "review the project architecture",
      expect.objectContaining({ sessionId: "ses_1" }),
    );

    manager.dispose();
  });

  it("merges final run events back into the snapshot before clearing loading state", async () => {
    let run!: AgentRun;
    let resolveEvents!: () => void;
    const events = new Promise<AnyAgentEvent[]>((resolve) => {
      resolveEvents = () => resolve(run.getSnapshot());
    });
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        run = new AgentRun(options.sessionId);
        return {
          run,
          childRuns: new Map(),
          handle: { completion: completionForEvents(events), cancel: vi.fn() },
          sessionId: options.sessionId,
        };
      }),
    };
    const manager = new AgentApplication(undefined, {
      sessionManager,
      chatService,
    });

    manager.send("hello");
    run.emit("user-input", { content: "hello" });
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
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        run = new AgentRun(options.sessionId);
        const deferred = createDeferredRunHandle();
        resolveCompletion = deferred.resolveCompletion;
        return {
          run,
          childRuns: new Map(),
          handle: deferred.handle,
          sessionId: options.sessionId,
        };
      }),
    };
    const manager = new AgentApplication(undefined, {
      sessionManager,
      chatService,
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
      expect.objectContaining({ type: "assistant", content: "Error: model exploded" }),
    ]);
  });

  it("drops partial live events when the active run completes as cancelled", async () => {
    let run!: AgentRun;
    let resolveCompletion!: (completion: RunCompletion<AgentEventDataMap>) => void;
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        run = new AgentRun(options.sessionId);
        const deferred = createDeferredRunHandle();
        resolveCompletion = deferred.resolveCompletion;
        return {
          run,
          childRuns: new Map(),
          handle: deferred.handle,
          sessionId: options.sessionId,
        };
      }),
    };
    const manager = new AgentApplication(undefined, {
      sessionManager,
      chatService,
    });

    manager.send("hello");
    run.emit("user-input", { content: "partial" });
    run.flushNotify();
    expect(manager.getSnapshot().displayBlocks).toHaveLength(1);

    resolveCompletion({ status: "cancelled", events: [...run.getSnapshot()] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snapshot = manager.getSnapshot();
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.displayBlocks).toEqual([]);
  });

  it("clears loading state when the active run is cancelled", () => {
    const cancel = vi.fn();
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => ({
        run: new AgentRun(options.sessionId),
        childRuns: new Map(),
        handle: createPendingRunHandle(cancel),
        sessionId: options.sessionId,
      })),
    };
    const manager = new AgentApplication(undefined, {
      sessionManager,
      chatService,
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
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        run = new AgentRun(options.sessionId);
        const deferred = createDeferredRunHandle();
        resolveCompletion = deferred.resolveCompletion;
        return {
          run,
          childRuns: new Map(),
          handle: deferred.handle,
          sessionId: options.sessionId,
        };
      }),
    };
    const manager = new AgentApplication(undefined, {
      sessionManager,
      chatService,
    });

    manager.send("hello");
    run.emit("user-input", { content: "old partial" });
    manager.cancel();
    resolveCompletion({ status: "completed", events: [...run.getSnapshot()] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(manager.getSnapshot().displayBlocks).toEqual([]);
  });

  it("ignores stale completions when a newer run is active", async () => {
    const runs: AgentRun[] = [];
    const completions: Array<(completion: RunCompletion<AgentEventDataMap>) => void> = [];
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        const run = new AgentRun(options.sessionId);
        const deferred = createDeferredRunHandle();
        runs.push(run);
        completions.push(deferred.resolveCompletion);
        return {
          run,
          childRuns: new Map(),
          handle: deferred.handle,
          sessionId: options.sessionId,
        };
      }),
    };
    const manager = new AgentApplication(undefined, {
      sessionManager,
      chatService,
    });

    manager.send("first");
    runs[0].emit("user-input", { content: "first" });
    manager.cancel();
    manager.send("second");
    runs[1].emit("user-input", { content: "second" });

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
      resolveEvents = () => resolve(run.getSnapshot());
    });
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        run = new AgentRun(options.sessionId);
        return {
          run,
          childRuns: new Map(),
          handle: { completion: completionForEvents(events), cancel: vi.fn() },
          sessionId: options.sessionId,
        };
      }),
    };
    const manager = new AgentApplication(undefined, {
      sessionManager,
      chatService,
    });

    manager.send("hello");
    run.emit("user-input", { content: "hello" });
    resolveEvents();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manager.getSnapshot().displayBlocks).toHaveLength(1);

    await manager.deleteSession("ses_1");

    const snapshot = manager.getSnapshot();
    expect(snapshot.currentSessionId).toBeNull();
    expect(snapshot.displayBlocks).toEqual([]);
  });

  it("schedules a snapshot notification when sub-agent events arrive", async () => {
    let subAgentEvents!: SubAgentEventSink;
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        subAgentEvents = options.subAgentEvents;
        return {
          run: new AgentRun(options.sessionId),
          childRuns: new Map(),
          handle: createPendingRunHandle(),
          sessionId: options.sessionId,
        };
      }),
    };
    const manager = new AgentApplication(undefined, {
      sessionManager,
      chatService,
    });
    const listener = vi.fn();
    manager.subscribe(listener);

    manager.send("hello");
    const callsAfterSend = listener.mock.calls.length;
    subAgentEvents.emit("spawned", { toolCallId: "tc1", role: "Bug Hunter" });
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
    const controller = createCheckpointingChatService();
    const manager = new AgentApplication(undefined, {
      sessionManager: createWorkspaceSessionManager(workspaceRoot),
      chatService: controller.chatService,
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
    const controller = createCheckpointingChatService();
    const manager = new AgentApplication(undefined, {
      sessionManager: createWorkspaceSessionManager(workspaceRoot),
      chatService: controller.chatService,
    });

    manager.send("change file");
    const run = controller.getRun();
    const fileCheckpoint = controller.getFileCheckpoint();
    await fileCheckpoint.captureBeforeWrite(filePath, fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    fileCheckpoint.recordWrite(filePath, fullPath, "agent edit");
    run.emit("user-input", { content: "change file" });
    await persistCompletedRun("ses_1", run);
    controller.resolveCompletion({ status: "completed", events: [...run.getSnapshot()] });
    await new Promise((resolve) => setTimeout(resolve, 0));

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
    const controller = createCheckpointingChatService();
    const manager = new AgentApplication(undefined, {
      sessionManager: createWorkspaceSessionManager(workspaceRoot),
      chatService: controller.chatService,
    });

    manager.send("change file");
    const run = controller.getRun();
    const fileCheckpoint = controller.getFileCheckpoint();
    await fileCheckpoint.captureBeforeWrite(filePath, fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    fileCheckpoint.recordWrite(filePath, fullPath, "agent edit");
    run.emit("user-input", { content: "change file" });
    await persistCompletedRun("ses_1", run);
    controller.resolveCompletion({ status: "completed", events: [...run.getSnapshot()] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await writeFile(fullPath, "user edit", "utf-8");

    const result = await manager.revertLastTurn();

    expect(result.message).toContain("Cannot revert");
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("user edit");
    await expect(new JsonlRunRecorder().loadRawEvents("ses_1")).resolves.toHaveLength(2);
  });
});
