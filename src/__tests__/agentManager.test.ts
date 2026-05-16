import { describe, expect, it, vi } from "vitest";
import {
  AgentManager,
  type ChatTurnService,
} from "@excelsior/agent-host/testing/application";
import {
  AgentRun,
  type AgentEventDataMap,
  type AnyAgentEvent,
  type SubAgentEventSink,
} from "@excelsior/agent-host/testing/runtime";
import type { RunCompletion, RunHandle } from "@excelsior/run-runtime";
import {
  createFakeChatService,
  createFakeSessionManager,
  createPendingRunHandle,
} from "./helpers/agentManager.js";

function completionFor(done: Promise<AnyAgentEvent[]>) {
  return done.then((events) => ({ status: "completed" as const, events }));
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
      done: completion.then((result) => result.events),
      cancel,
    },
    resolveCompletion,
  };
}

describe("AgentManager session ownership", () => {
  it("refreshes snapshot after session CRUD with a plain SessionManager service", async () => {
    const sessionManager = createFakeSessionManager();
    const manager = new AgentManager(undefined, {
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
    const manager = new AgentManager(undefined, {
      sessionManager,
      chatService,
    });

    manager.send("  review the project architecture  ");

    expect(manager.getSnapshot().sessions[0].title).toBe("Untitled");
    expect(chatService.submitUserTurn).toHaveBeenCalledWith(
      "review the project architecture",
      expect.objectContaining({ sessionId: "ses_1" }),
    );

    manager.dispose();
  });

  it("merges final run events back into the snapshot before clearing loading state", async () => {
    let run!: AgentRun;
    let resolveDone!: () => void;
    const done = new Promise<AnyAgentEvent[]>((resolve) => {
      resolveDone = () => resolve(run.getSnapshot());
    });
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        run = new AgentRun(options.sessionId);
        return {
          run,
          childRuns: new Map(),
          handle: { done, completion: completionFor(done), cancel: vi.fn() },
          sessionId: options.sessionId,
        };
      }),
    };
    const manager = new AgentManager(undefined, {
      sessionManager,
      chatService,
    });

    manager.send("hello");
    run.emit("user-input", { content: "hello" });
    expect(manager.getSnapshot().isLoading).toBe(true);

    resolveDone();
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
    const manager = new AgentManager(undefined, {
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
    const manager = new AgentManager(undefined, {
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
    const manager = new AgentManager(undefined, {
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
    const manager = new AgentManager(undefined, {
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
    const manager = new AgentManager(undefined, {
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
    let resolveDone!: () => void;
    const done = new Promise<AnyAgentEvent[]>((resolve) => {
      resolveDone = () => resolve(run.getSnapshot());
    });
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => {
        run = new AgentRun(options.sessionId);
        return {
          run,
          childRuns: new Map(),
          handle: { done, completion: completionFor(done), cancel: vi.fn() },
          sessionId: options.sessionId,
        };
      }),
    };
    const manager = new AgentManager(undefined, {
      sessionManager,
      chatService,
    });

    manager.send("hello");
    run.emit("user-input", { content: "hello" });
    resolveDone();
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
    const manager = new AgentManager(undefined, {
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
