import { describe, expect, it, vi } from "vitest";
import {
  AgentManager,
  type ChatTurnService,
} from "@excelsior/agent-host/testing/application";
import {
  AgentRun,
  type AnyAgentEvent,
  type SubAgentEventSink,
} from "@excelsior/agent-host/testing/runtime";
import {
  createFakeChatService,
  createFakeSessionManager,
  createPendingRunHandle,
} from "./helpers/agentManager.js";

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
          handle: { done, cancel: vi.fn() },
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

  it("clears loading state when the active run is cancelled", () => {
    const cancel = vi.fn();
    const sessionManager = createFakeSessionManager();
    const chatService: ChatTurnService = {
      submitUserTurn: vi.fn((_content, options) => ({
        run: new AgentRun(options.sessionId),
        childRuns: new Map(),
        handle: { done: new Promise(() => {}), cancel },
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
          handle: { done, cancel: vi.fn() },
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
          handle: { done: new Promise(() => {}), cancel: vi.fn() },
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
