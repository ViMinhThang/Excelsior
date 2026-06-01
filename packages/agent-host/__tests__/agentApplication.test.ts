import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  AgentApplication,
  type AgentSessionStorage,
} from "@excelsior/agent-host/testing/application";
import { JsonlRunRecorder } from "@excelsior/agent-storage";
import type { RevertCapability } from "@excelsior/agent-host/testing/tools";
import {
  createFakeSessionStorage,
  createFakeTurnLifecycle,
  waitForFakeAgentStream,
  type FakeAgentStream,
  type FakeTurnLifecycle,
} from "./helpers/agentApplication.js";

async function waitForIdle(manager: AgentApplication): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!manager.getSnapshot().isLoading) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for agent application to become idle");
}

function createWorkspaceSessionStorage(workspaceRoot: string, recorder?: JsonlRunRecorder): AgentSessionStorage {
  return createFakeSessionStorage(workspaceRoot, recorder);
}

function createCheckpointingTurnLifecycle(): {
  turnLifecycle: FakeTurnLifecycle;
  waitForStream(): Promise<FakeAgentStream>;
  getRevertCapability(stream: FakeAgentStream): RevertCapability;
  resolveCompletion(stream: FakeAgentStream): void;
} {
  const turnLifecycle = createFakeTurnLifecycle();

  return {
    turnLifecycle,
    waitForStream: () => waitForFakeAgentStream(turnLifecycle),
    getRevertCapability: (stream) => {
      const revert = stream.runContext.ctx.revert;
      if (!revert) throw new Error("Revert capability not captured");
      return revert;
    },
    resolveCompletion: (stream) => stream.resolve(),
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

  it("creates an untitled session when send is called without a title", async () => {
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createFakeTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    await manager.send("  review the project architecture  ");
    const stream = await waitForFakeAgentStream(turnLifecycle);

    expect(manager.getSnapshot().sessions[0].title).toBe("review the project architecture");
    expect(stream.run.sessionId).toBe("ses_1");
    expect(stream.messages?.at(-1)).toEqual({
      role: "user",
      content: "review the project architecture",
    });

    stream.resolve();
    manager.dispose();
  });

  it("merges final run events back into the snapshot before clearing loading state", async () => {
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createFakeTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    await manager.send("hello");
    expect(manager.getSnapshot().isLoading).toBe(true);

    const stream = await waitForFakeAgentStream(turnLifecycle);
    stream.resolve();
    await waitForIdle(manager);

    const snapshot = manager.getSnapshot();
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.displayBlocks).toEqual([
      expect.objectContaining({ type: "user", content: "hello" }),
    ]);
  });

  it("keeps failed run final events visible before clearing loading state", async () => {
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createFakeTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    await manager.send("hello");
    const stream = await waitForFakeAgentStream(turnLifecycle);
    stream.reject(new Error("model exploded"));
    await waitForIdle(manager);

    const snapshot = manager.getSnapshot();
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.displayBlocks).toEqual([
      expect.objectContaining({ type: "user", content: "hello" }),
      expect.objectContaining({ type: "assistant", content: "Error: model exploded" }),
    ]);
  });

  it("drops partial live events when the active run completes as cancelled", async () => {
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createFakeTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    await manager.send("hello");
    expect(manager.getSnapshot().displayBlocks).toHaveLength(1);

    const stream = await waitForFakeAgentStream(turnLifecycle);
    stream.run.cancel();
    stream.resolve();
    await waitForIdle(manager);

    const snapshot = manager.getSnapshot();
    expect(snapshot.isLoading).toBe(false);
    expect(snapshot.displayBlocks).toEqual([]);
  });

  it("clears loading state when the active run is cancelled", async () => {
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createFakeTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    await manager.send("hello");
    const stream = await waitForFakeAgentStream(turnLifecycle);
    expect(manager.getSnapshot().isLoading).toBe(true);

    manager.cancel();

    expect(manager.getSnapshot().isLoading).toBe(false);
    stream.resolve();
  });

  it("ignores stale completions after cancellation", async () => {
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createFakeTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    await manager.send("hello");
    const stream = await waitForFakeAgentStream(turnLifecycle);
    manager.cancel();
    stream.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(manager.getSnapshot().displayBlocks).toEqual([]);
  });

  it("ignores stale completions when a newer run is active", async () => {
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createFakeTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    await manager.send("first");
    const first = await waitForFakeAgentStream(turnLifecycle, 0);
    manager.cancel();
    await manager.send("second");
    const second = await waitForFakeAgentStream(turnLifecycle, 1);

    first.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manager.getSnapshot().isLoading).toBe(true);

    second.resolve();
    await waitForIdle(manager);

    expect(manager.getSnapshot().displayBlocks).toEqual([
      expect.objectContaining({ type: "user", content: "second" }),
    ]);
  });

  it("clears restored display state after deleting the current session", async () => {
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createFakeTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });

    await manager.send("hello");
    const stream = await waitForFakeAgentStream(turnLifecycle);
    stream.resolve();
    await waitForIdle(manager);
    expect(manager.getSnapshot().displayBlocks).toHaveLength(1);

    await manager.deleteSession("ses_1");

    const snapshot = manager.getSnapshot();
    expect(snapshot.currentSessionId).toBeNull();
    expect(snapshot.displayBlocks).toEqual([]);
  });

  it("schedules a snapshot notification when sub-agent events arrive", async () => {
    const sessionStorage = createFakeSessionStorage();
    const turnLifecycle = createFakeTurnLifecycle();
    const manager = new AgentApplication(undefined, {
      sessionStorage,
      turnLifecycle,
    });
    const listener = vi.fn();
    manager.subscribe(listener);

    await manager.send("hello");
    const stream = await waitForFakeAgentStream(turnLifecycle);
    const callsAfterSend = listener.mock.calls.length;
    stream.runContext.subAgentEvents.emit("spawned", {
      toolCallId: "tc1",
      role: "Bug Hunter",
    });
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
  });

  afterEach(async () => {
    await new JsonlRunRecorder(sessionsDir).deleteAllSessionEvents();
    await rm(sessionsDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("refuses to revert while a run is active", async () => {
    const controller = createCheckpointingTurnLifecycle();
    const recorder = new JsonlRunRecorder(sessionsDir);
    const manager = new AgentApplication(undefined, {
      sessionStorage: createWorkspaceSessionStorage(workspaceRoot, recorder),
      turnLifecycle: controller.turnLifecycle,
      recorder,
    });

    await manager.send("change file");

    await expect(manager.revertLastTurn()).resolves.toMatchObject({
      message: "Cannot revert while a run is active. Cancel it first.",
    });
  });

  it("restores checkpointed files and removes the latest turn from history", async () => {
    const filePath = "demo.txt";
    const fullPath = join(workspaceRoot, filePath);
    await writeFile(fullPath, "original", "utf-8");
    const controller = createCheckpointingTurnLifecycle();
    const recorder = new JsonlRunRecorder(sessionsDir);
    const manager = new AgentApplication(undefined, {
      sessionStorage: createWorkspaceSessionStorage(workspaceRoot, recorder),
      turnLifecycle: controller.turnLifecycle,
      recorder,
    });

    await manager.send("change file");
    const stream = await controller.waitForStream();
    const revert = controller.getRevertCapability(stream);
    await revert.captureBeforeWrite(filePath, fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    revert.recordWrite(filePath, fullPath, "agent edit");
    controller.resolveCompletion(stream);
    await waitForIdle(manager);

    const result = await manager.revertLastTurn();

    expect(result.message).toContain("Reverted latest turn");
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("original");
    await expect(new JsonlRunRecorder(sessionsDir).loadRawEvents("ses_1")).resolves.toEqual([]);
    expect(manager.getSnapshot().displayBlocks).toEqual([]);
  });

  it("reports conflicts without changing files or history", async () => {
    const filePath = "demo.txt";
    const fullPath = join(workspaceRoot, filePath);
    await writeFile(fullPath, "original", "utf-8");
    const controller = createCheckpointingTurnLifecycle();
    const recorder = new JsonlRunRecorder(sessionsDir);
    const manager = new AgentApplication(undefined, {
      sessionStorage: createWorkspaceSessionStorage(workspaceRoot, recorder),
      turnLifecycle: controller.turnLifecycle,
      recorder,
    });

    await manager.send("change file");
    const stream = await controller.waitForStream();
    const revert = controller.getRevertCapability(stream);
    await revert.captureBeforeWrite(filePath, fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    revert.recordWrite(filePath, fullPath, "agent edit");
    controller.resolveCompletion(stream);
    await waitForIdle(manager);
    await writeFile(fullPath, "user edit", "utf-8");

    const result = await manager.revertLastTurn();

    expect(result.message).toContain("Cannot revert");
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("user edit");
    await expect(new JsonlRunRecorder(sessionsDir).loadRawEvents("ses_1")).resolves.toHaveLength(2);
  });
});
