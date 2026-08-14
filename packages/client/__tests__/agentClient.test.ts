import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInProcessTransport, makeEnvelope } from "@excelsior/protocol";
import type { AgentCommand, AgentRequest } from "@excelsior/protocol";
import {
  DiffEmitter,
  RunStore,
  SessionStore,
  createMutate,
  createResponder,
  createSyncService,
  type RunTurn,
} from "@excelsior/engine";
import { AgentClient } from "../src/index.js";

interface Harness {
  client: AgentClient;
  engine: {
    mutate: ReturnType<typeof createMutate>;
    startTurn: (content: string) => void;
    meta: { currentSessionId: string | null };
  };
  cleanup: () => void;
}

function createHarness(dataDir: string): Harness {
  const { a: transportA, b: transportB } = createInProcessTransport();

  const emitter = new DiffEmitter();
  const store = new SessionStore(dataDir);
  const runStore = new RunStore();
  const meta = {
    currentSessionId: null as string | null,
    mode: "act" as const,
    settings: {
      githubToken: "",
      agentToolLoopSteps: "unlimited",
      autoReflectionEnabled: false,
    },
    workspace: { id: "ws1", name: "Workspace", rootPath: "C:/ws" },
    llm: { providerName: "deepseek", modelName: "deepseek-chat" },
  };
  const mutate = createMutate({ store, emitter, runStore, meta });
  const syncService = createSyncService({ emitter, store, runStore, meta });

  let turnCounter = 0;
  const startTurn = (content: string): void => {
    const sessionId = meta.currentSessionId;
    if (!sessionId) return;
    const turn: RunTurn = {
      id: `turn_${++turnCounter}`,
      sessionId,
      status: "running",
      userContent: content,
      steps: [],
      blocks: [],
      startedAt: Date.now(),
    };
    mutate({ kind: "run-begin", turn });
    mutate({ kind: "run-text", turnId: turn.id, content: "Hello" });
    mutate({
      kind: "run-tool-start",
      turnId: turn.id,
      call: { id: "tool1", toolName: "view", args: { filePath: "a.ts" }, status: "executing" },
    });
    mutate({ kind: "run-tool-end", callId: "tool1", result: "file contents" });
    mutate({ kind: "run-text", turnId: turn.id, content: " Done." });
    mutate({ kind: "run-commit", turnId: turn.id });
  };

  const responder = createResponder({
    mutate,
    emitter,
    store,
    runStore,
    meta,
    syncService,
    startTurn,
  });

  emitter.subscribe((delta) => transportB.send(makeEnvelope("delta", delta, 0)));
  transportB.onMessage((message) => {
    if (message.type === "command") {
      transportB.send(makeEnvelope("response", responder.handleCommand(message.payload as AgentCommand), 0));
    } else if (message.type === "request") {
      transportB.send(makeEnvelope("response", responder.handleRequest(message.payload as AgentRequest), 0));
    }
  });

  const client = new AgentClient(transportA);
  return {
    client,
    engine: { mutate, startTurn, meta },
    cleanup: () => {
      client.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("AgentClient", () => {
  const dirs: string[] = [];
  const dataDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "excelsior-client-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("connect syncs meta, catalog, and the current session slice", async () => {
    const harness = createHarness(dataDir());
    harness.engine.mutate({ kind: "session-create", title: "First session" });
    await harness.client.connect();

    const meta = harness.client.getSlice("meta");
    expect(meta.sessions).toHaveLength(1);
    expect(meta.sessions[0].title).toBe("First session");
    expect(meta.currentSessionId).toBe(meta.sessions[0].id);
    expect(meta.workspace.name).toBe("Workspace");
    expect(meta.mode).toBe("act");

    const catalog = harness.client.getSlice("catalog");
    expect(catalog.commands.length).toBeGreaterThanOrEqual(4);
    expect(catalog.settings.githubToken).toBe("");

    const session = harness.client.getSlice("session");
    expect(session).not.toBeNull();
    expect(session?.blocks).toEqual([]);
    expect(harness.client.getSlice("run")).toBeNull();

    harness.cleanup();
  });

  it("a streaming turn updates only the run slice; commit lands blocks once in the session slice", async () => {
    const harness = createHarness(dataDir());
    harness.engine.mutate({ kind: "session-create", title: "S1" });
    await harness.client.connect();

    let runCalls = 0;
    let sessionCalls = 0;
    harness.client.subscribe("run", () => {
      runCalls += 1;
    });
    harness.client.subscribe("session", () => {
      sessionCalls += 1;
    });

    const ack = await harness.client.command({ cmd: "send", content: "hi" });
    expect(ack.ok).toBe(true);

    expect(runCalls).toBe(6);
    expect(sessionCalls).toBe(4);
    expect(harness.client.getSlice("run")).toBeNull();

    const session = harness.client.getSlice("session");
    expect(session?.blocks).toHaveLength(4);
    expect(session?.blocks[0].kind).toBe("user");
    expect(session?.blocks[0].content).toBe("hi");
    expect(session?.blocks[1].content).toBe("Hello");
    expect(session?.blocks[2].kind).toBe("tool-call");
    expect(session?.blocks[2].tool?.result).toBe("file contents");
    expect(session?.blocks[3].content).toBe(" Done.");

    harness.cleanup();
  });

  it("keeps the run slice items interleaved in order while a turn streams", async () => {
    const harness = createHarness(dataDir());
    harness.engine.mutate({ kind: "session-create", title: "S1" });
    await harness.client.connect();

    const sessionId = harness.client.getSlice("meta").currentSessionId!;
    const turn: RunTurn = {
      id: "turn_interleaved",
      sessionId,
      status: "running",
      userContent: "go",
      steps: [],
      blocks: [],
      startedAt: Date.now(),
    };
    harness.engine.mutate({ kind: "run-begin", turn });
    harness.engine.mutate({ kind: "run-text", turnId: turn.id, content: "Let me check." });
    harness.engine.mutate({
      kind: "run-tool-start",
      turnId: turn.id,
      call: { id: "tool1", toolName: "view", args: { filePath: "a.ts" }, status: "executing" },
    });
    harness.engine.mutate({ kind: "run-tool-end", callId: "tool1", result: "file contents" });
    harness.engine.mutate({ kind: "run-text", turnId: turn.id, content: " Done." });

    const items = harness.client.getSlice("run")!.items;
    expect(items.map((item) => item.kind)).toEqual([
      "assistant",
      "tool-call",
      "assistant",
    ]);
    expect(items[0].kind === "assistant" ? items[0].content : "").toBe("Let me check.");
    expect(items[1].kind === "tool-call" ? items[1].tool.result : "").toBe("file contents");
    expect(items[2].kind === "assistant" ? items[2].content : "").toBe(" Done.");

    harness.cleanup();
  });

  it("session-create switches the synced session and fires onSessionChanged", async () => {
    const harness = createHarness(dataDir());
    harness.engine.mutate({ kind: "session-create", title: "S1" });
    await harness.client.connect();

    const changed: Array<string | null> = [];
    harness.client.onSessionChanged((id) => changed.push(id));

    const ack = await harness.client.command({ cmd: "session-create", title: "S2" });
    expect(ack.ok).toBe(true);
    await tick();

    expect(changed).toHaveLength(1);
    expect(harness.client.getSlice("meta").currentSessionId).toBe(changed[0]);
    expect(harness.client.getSlice("meta").sessions).toHaveLength(2);
    const session = harness.client.getSlice("session");
    expect(session).not.toBeNull();
    expect(session?.blocks).toEqual([]);

    harness.cleanup();
  });

  it("settings-save refetches the catalog slice", async () => {
    const harness = createHarness(dataDir());
    harness.engine.mutate({ kind: "session-create", title: "S1" });
    await harness.client.connect();

    const ack = await harness.client.command({
      cmd: "settings-save",
      patch: { autoApproveWorkspaceEdits: true },
    });
    expect(ack.ok).toBe(true);
    expect(harness.client.getSlice("catalog").settings.autoApproveWorkspaceEdits).toBe(true);

    harness.cleanup();
  });

  it("reconnect restores the transcript by snapshot and resets the run slice", async () => {
    const dir = dataDir();
    const harness = createHarness(dir);
    harness.engine.mutate({ kind: "session-create", title: "S1" });
    await harness.client.connect();
    const sessionId = harness.client.getSlice("meta").currentSessionId!;
    harness.client.close();

    const restarted = createHarness(dir);
    restarted.engine.mutate({ kind: "session-switch", sessionId });
    await restarted.client.connect();
    restarted.engine.startTurn("second turn");

    const session = restarted.client.getSlice("session");
    expect(session?.blocks).toHaveLength(4);
    expect(session?.blocks[0].content).toBe("second turn");
    expect(session?.blocks[1].content).toBe("Hello");
    expect(restarted.client.getSlice("run")).toBeNull();

    harness.cleanup();
    restarted.cleanup();
  });

  it("syncAll after missed deltas refreshes slices by snapshot", async () => {
    const dir = dataDir();
    const harness = createHarness(dir);
    harness.engine.mutate({ kind: "session-create", title: "S1" });
    await harness.client.connect();
    const sessionId = harness.client.getSlice("meta").currentSessionId!;
    expect(harness.client.getSlice("meta").mode).toBe("act");

    harness.client.close();
    harness.engine.mutate({ kind: "mode-set", mode: "plan" });
    harness.engine.mutate({ kind: "mode-set", mode: "act" });

    const reconnected = createHarness(dir);
    await reconnected.client.connect();
    await reconnected.client.command({ cmd: "session-switch", sessionId });
    await tick();
    expect(reconnected.client.getSlice("meta").mode).toBe("act");
    expect(reconnected.client.getSlice("meta").currentSessionId).toBe(sessionId);
    expect(reconnected.client.getSlice("session")).not.toBeNull();

    harness.cleanup();
    reconnected.cleanup();
  });

  it("unknown session switch returns an error ack and fires onError", async () => {
    const harness = createHarness(dataDir());
    harness.engine.mutate({ kind: "session-create", title: "S1" });
    await harness.client.connect();

    const errors: string[] = [];
    harness.client.onError((message) => errors.push(message));

    const ack = await harness.client.command({ cmd: "session-switch", sessionId: "unknown" });
    expect(ack.ok).toBe(false);
    expect(errors).toContain("unknown session unknown");
    expect(harness.client.getSlice("meta").currentSessionId).not.toBeNull();

    harness.cleanup();
  });

  it("send while a run is active returns a busy ack", async () => {
    const harness = createHarness(dataDir());
    harness.engine.mutate({ kind: "session-create", title: "S1" });
    await harness.client.connect();

    const sessionId = harness.client.getSlice("meta").currentSessionId!;
    harness.engine.mutate({
      kind: "run-begin",
      turn: {
        id: "turn_busy",
        sessionId,
        status: "running",
        userContent: "active",
        steps: [],
        blocks: [],
        startedAt: Date.now(),
      },
    });

    const ack = await harness.client.command({ cmd: "send", content: "again" });
    expect(ack.ok).toBe(true);
    if (ack.ok) expect(ack.result?.kind).toBe("busy");
    expect(harness.client.getSlice("run")?.turnId).toBe("turn_busy");

    harness.cleanup();
  });

  it("unsubscribe stops slice notifications", async () => {
    const harness = createHarness(dataDir());
    harness.engine.mutate({ kind: "session-create", title: "S1" });
    await harness.client.connect();

    let calls = 0;
    const unsubscribe = harness.client.subscribe("run", () => {
      calls += 1;
    });
    harness.engine.startTurn("one");
    const callsAfterTurn = calls;
    unsubscribe();
    harness.engine.startTurn("two");
    expect(callsAfterTurn).toBeGreaterThan(0);
    expect(calls).toBe(callsAfterTurn);

    harness.cleanup();
  });
});
