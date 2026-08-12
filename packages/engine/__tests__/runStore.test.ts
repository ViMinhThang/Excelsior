import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMutate, DiffEmitter, RunStore, SessionStore } from "@excelsior/engine";
import type { MetaState, Mutation, RunTurn } from "@excelsior/engine";
import type { AgentLlmInfo, AppSettings, Workspace, WireDelta } from "@excelsior/protocol";

const SETTINGS: AppSettings = {
  deepseekApiKey: "sk-test",
  githubToken: "",
  agentToolLoopSteps: "unlimited",
  autoReflectionEnabled: false,
};

const WORKSPACE: Workspace = { id: "w1", name: "test", rootPath: "C:\\" };
const LLM: AgentLlmInfo = { providerName: "deepseek", modelName: "deepseek-chat" };

function makeTurn(sessionId: string): RunTurn {
  return {
    id: `turn_${sessionId}_1`,
    sessionId,
    status: "running",
    userContent: "hello",
    steps: [],
    blocks: [],
    startedAt: Date.now(),
  };
}

describe("RunStore mutations", () => {
  let dataDir: string;
  let store: SessionStore;
  let emitter: DiffEmitter;
  let runStore: RunStore;
  let mutate: (mutation: Mutation) => void;
  let meta: MetaState;
  let deltas: WireDelta[];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "excelsior-run-"));
    store = new SessionStore(dataDir, "w");
    emitter = new DiffEmitter();
    runStore = new RunStore();
    meta = {
      currentSessionId: null,
      mode: "plan",
      settings: SETTINGS,
      workspace: WORKSPACE,
      llm: LLM,
    };
    mutate = createMutate({ store, emitter, runStore, meta });
    deltas = [];
    emitter.subscribe((d) => deltas.push(d));
    mutate({ kind: "session-create", title: "s" });
  });

  afterEach(() => {
    store.flush();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("run-begin activates the turn and emits run-status running", () => {
    const turn = makeTurn(meta.currentSessionId!);
    mutate({ kind: "run-begin", turn });

    expect(runStore.isActive()).toBe(true);
    expect(runStore.activeTurn!.id).toBe(turn.id);
    const last = deltas[deltas.length - 1];
    expect(last.scope).toEqual({ kind: "run", sessionId: meta.currentSessionId });
    expect(last.delta).toMatchObject({ kind: "run-status", status: "running" });
  });

  it("run-begin while active is rejected with an error delta", () => {
    const first = makeTurn(meta.currentSessionId!);
    mutate({ kind: "run-begin", turn: first });
    const turn2 = makeTurn(meta.currentSessionId!);
    turn2.id = "turn_2";
    mutate({ kind: "run-begin", turn: turn2 });

    const last = deltas[deltas.length - 1];
    expect(last.delta.kind).toBe("error");
    expect(runStore.activeTurn!.id).toBe(first.id);
  });

  it("run-text accumulates into the step, streaming block, and emits deltas", () => {
    const turn = makeTurn(meta.currentSessionId!);
    mutate({ kind: "run-begin", turn });
    mutate({ kind: "run-text", turnId: turn.id, content: "Hel" });
    mutate({ kind: "run-text", turnId: turn.id, content: "lo" });

    const textDeltas = deltas.filter((d) => d.delta.kind === "run-text-delta");
    expect(textDeltas.map((d) => (d.delta as { content: string }).content)).toEqual(["Hel", "lo"]);
    expect(runStore.activeTurn!.steps).toHaveLength(1);
    expect(runStore.activeTurn!.steps[0].modelOutput).toBe("Hello");
    expect(runStore.activeTurn!.blocks[0]).toMatchObject({ kind: "assistant", content: "Hello" });
  });

  it("tool lifecycle: start, update, end emits run-tool deltas", () => {
    const turn = makeTurn(meta.currentSessionId!);
    mutate({ kind: "run-begin", turn });
    mutate({ kind: "run-tool-start", turnId: turn.id, call: { id: "call_1", toolName: "view", args: { path: "a.ts" }, status: "streaming-input" } });
    mutate({ kind: "run-tool-update", callId: "call_1", result: "line1\n" });
    mutate({ kind: "run-tool-end", callId: "call_1", result: "line1\nline2" });

    const toolDeltas = deltas.filter((d) => d.delta.kind === "run-tool");
    expect(toolDeltas).toHaveLength(3);
    expect(toolDeltas[2].delta).toMatchObject({
      kind: "run-tool",
      tool: { id: "call_1", status: "done", result: "line1\nline2", isError: false },
    });
    const call = runStore.activeTurn!.steps[0].toolCalls[0];
    expect(call.status).toBe("done");
    expect(call.result).toBe("line1\nline2");
    expect(runStore.activeTurn!.blocks[0]).toMatchObject({
      kind: "tool-call",
      tool: { id: "call_1", toolName: "view", result: "line1\nline2" },
    });
  });

  it("run-commit converts the turn into transcript blocks, checkpoints, and clears", () => {
    const turn = makeTurn(meta.currentSessionId!);
    mutate({ kind: "run-begin", turn });
    mutate({ kind: "run-text", turnId: turn.id, content: "answer" });
    mutate({ kind: "run-tool-start", turnId: turn.id, call: { id: "call_1", toolName: "view", args: "{}", status: "executing", startedAt: Date.now() } });
    mutate({ kind: "run-tool-end", callId: "call_1", result: "42" });
    const sessionId = meta.currentSessionId!;

    mutate({ kind: "run-commit", turnId: turn.id });

    expect(runStore.isActive()).toBe(false);
    const committed = store.load(sessionId)!;
    expect(committed.blocks.map((b) => b.kind)).toEqual(["user", "assistant", "tool-call"]);
    expect(committed.blocks[0].content).toBe("hello");
    expect(committed.blocks[1].content).toBe("answer");
    expect(committed.blocks[2].tool).toMatchObject({ toolName: "view", result: "42", status: "completed" });

    const committedDeltas = deltas.filter((d) => d.delta.kind === "block-committed");
    expect(committedDeltas).toHaveLength(3);
    const last = deltas[deltas.length - 1];
    expect(last.delta).toMatchObject({ kind: "run-status", status: "committed" });

    const reloaded = new SessionStore(dataDir, "w");
    expect(reloaded.load(sessionId)!.blocks).toHaveLength(3);
  });

  it("run-cancel commits the turn as interrupted with open tools failed", () => {
    const turn = makeTurn(meta.currentSessionId!);
    mutate({ kind: "run-begin", turn });
    mutate({ kind: "run-text", turnId: turn.id, content: "partial" });
    mutate({ kind: "run-tool-start", turnId: turn.id, call: { id: "call_1", toolName: "view", args: {}, status: "executing" } });
    const sessionId = meta.currentSessionId!;

    mutate({ kind: "run-cancel", turnId: turn.id });

    const committed = store.load(sessionId)!;
    expect(committed.blocks.map((b) => b.status)).toEqual(["completed", "interrupted", "interrupted"]);
    expect(committed.blocks[2].tool!.status).toBe("interrupted");
    const last = deltas[deltas.length - 1];
    expect(last.delta).toMatchObject({ kind: "run-status", status: "cancelled" });
    expect(runStore.isActive()).toBe(false);
  });

  it("run-fail commits the turn as failed and emits an error delta", () => {
    const turn = makeTurn(meta.currentSessionId!);
    mutate({ kind: "run-begin", turn });
    mutate({ kind: "run-text", turnId: turn.id, content: "partial" });
    const sessionId = meta.currentSessionId!;

    mutate({ kind: "run-fail", turnId: turn.id, error: "boom" });

    const committed = store.load(sessionId)!;
    expect(committed.blocks[1].status).toBe("failed");
    expect(runStore.isActive()).toBe(false);
    expect(deltas.some((d) => d.delta.kind === "error")).toBe(true);
  });

  it("run mutations on a stale turn id are rejected", () => {
    mutate({ kind: "run-text", turnId: "nope", content: "x" });
    expect(deltas[deltas.length - 1].delta.kind).toBe("error");
  });
});
